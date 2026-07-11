import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { storeMemory, searchMemory } from "@/lib/memory";
import { sendMessage } from "@/lib/telegram/client";
import { userToday } from "@/lib/config";
import { sendTaskOptions } from "@/lib/telegram/keyboards";
import { AREAS } from "@/lib/areas";
import { toUtcIso } from "@/lib/time";
import { addCalendarSource } from "@/lib/calendar/import";

// ---------------------------------------------------------------------------
// Tool registry. Each tool declares a JSON schema, a `reversible` flag, and a
// handler. Reversible tools execute immediately (then get audited). Irreversible
// tools are routed through the confirmation gate by lib/agent/execute.ts and are
// only ever run on an approved confirmation.
// ---------------------------------------------------------------------------

export type ToolContext = {
  userId: string;
  chatId?: string;
};

export type ToolResult = Record<string, unknown> & {
  // Handlers may attach _undo; execute.ts moves it to audit_log.undo_payload
  // and strips it before the result is shown to the model.
  _undo?: Record<string, unknown> | null;
};

export type ToolDef = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  reversible: boolean;
  resourceType?: string;
  handler: (input: any, ctx: ToolContext) => Promise<ToolResult>;
};

// --- helpers ---------------------------------------------------------------

// Timezone-aware: a naive datetime is read as USER_TIMEZONE, not server-UTC.
function toIso(value?: string | null): string | null {
  return toUtcIso(value);
}

async function findOrCreateEntity(
  userId: string,
  kind: "person" | "project" | "area" | "org",
  name?: string,
): Promise<string | null> {
  if (!name?.trim()) return null;
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .ilike("name", name.trim())
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await sb
    .from("entities")
    .insert({ user_id: userId, kind, name: name.trim() })
    .select("id")
    .single();
  if (error) {
    console.error("[tools] entity upsert failed:", error.message);
    return null;
  }
  return (created?.id as string) ?? null;
}

// Snap an area name to one of the seven canonical areas (never invents new
// ones). Returns null when it doesn't match — the caller then asks via buttons.
async function resolveAreaId(userId: string, name?: string): Promise<string | null> {
  if (!name?.trim()) return null;
  const n = name.trim().toLowerCase();
  const match = AREAS.find(
    (a) =>
      a.toLowerCase() === n ||
      n.includes(a.toLowerCase()) ||
      (n.length >= 3 && a.toLowerCase().includes(n)),
  );
  if (!match) return null;
  return findOrCreateEntity(userId, "area", match);
}

// When to first chase a task. With a deadline: 24h before (never in the past).
// Without one: still enter the follow-up cycle ~1 day out, so undated tasks are
// never silently ignored.
function defaultNudge(dueIso: string | null): string {
  if (!dueIso) return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const due = new Date(dueIso).getTime();
  const dayBefore = due - 24 * 60 * 60 * 1000;
  const soon = Date.now() + 60 * 1000;
  return new Date(Math.max(dayBefore, soon)).toISOString();
}

// --- the registry ----------------------------------------------------------

export const TOOLS: ToolDef[] = [
  {
    name: "create_task",
    description:
      "Create a task. Resolve relative deadlines to ISO. For any task with a deadline, set next_nudge_at BEFORE due_at so the follow-up engine chases it.",
    reversible: true,
    resourceType: "task",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        area: { type: "string", description: "Life-area name; resolved to an entity." },
        person: { type: "string", description: "Related person's name." },
        due_at: { type: "string", description: "ISO-8601 deadline." },
        next_nudge_at: { type: "string", description: "ISO-8601; when to first chase. Defaults before due_at." },
        urgency: { type: "string", enum: ["low", "normal", "high"] },
        priority_score: { type: "number" },
        subtasks: {
          type: "array",
          description:
            "Checklist sub-steps when the request contains one objective with multiple steps/details. Each may carry its own ISO deadline. Keep titles short.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              due_at: { type: "string", description: "Optional ISO-8601 deadline for this step." },
            },
            required: ["title"],
          },
        },
      },
      required: ["title"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const areaId = await resolveAreaId(ctx.userId, input.area);
      const personId = await findOrCreateEntity(ctx.userId, "person", input.person);
      const dueIso = toIso(input.due_at);
      const nudge = toIso(input.next_nudge_at) ?? defaultNudge(dueIso);
      const { data, error } = await sb
        .from("tasks")
        .insert({
          user_id: ctx.userId,
          title: input.title,
          description: input.description ?? null,
          area_id: areaId,
          person_id: personId,
          due_at: dueIso,
          next_nudge_at: nudge,
          urgency: input.urgency ?? null,
          priority_score: input.priority_score ?? 0,
          status: "open",
        })
        .select("id, title, status, due_at, next_nudge_at")
        .single();
      if (error) throw new Error(`create_task: ${error.message}`);
      // Sub-steps land as checklist items on the task (visible on the
      // dashboard rows and in the detail panel, each with its own deadline).
      const subs = Array.isArray(input.subtasks) ? input.subtasks : [];
      if (data && subs.length) {
        const rows = subs
          .filter((s: any) => s && typeof s.title === "string" && s.title.trim())
          .slice(0, 30)
          .map((s: any, i: number) => ({
            user_id: ctx.userId,
            task_id: data.id,
            title: String(s.title).trim().slice(0, 300),
            due_at: toIso(s.due_at),
            position: i,
          }));
        if (rows.length) {
          const { error: subErr } = await sb.from("task_checklist_items").insert(rows);
          if (subErr) console.error("[create_task] subtasks insert failed:", subErr.message);
        }
      }
      // Buttons-first: when no area was stated, ask via inline area buttons.
      if (!areaId && data) {
        try {
          await sendTaskOptions(data.id as string, input.title, true, ctx.chatId);
        } catch (e) {
          console.error("[create_task] sendTaskOptions failed:", e);
        }
      }
      return { ...data, subtasks: subs.length };
    },
  },

  {
    name: "update_task",
    description: "Update fields on an existing task (title, description, due_at, next_nudge_at, urgency, priority_score, area, person).",
    reversible: true,
    resourceType: "task",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        due_at: { type: "string" },
        next_nudge_at: { type: "string" },
        urgency: { type: "string" },
        priority_score: { type: "number" },
        area: { type: "string" },
        person: { type: "string" },
      },
      required: ["task_id"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const { data: prev } = await sb
        .from("tasks")
        .select("*")
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (!prev) throw new Error("update_task: task not found");
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.due_at !== undefined) patch.due_at = toIso(input.due_at);
      if (input.next_nudge_at !== undefined) patch.next_nudge_at = toIso(input.next_nudge_at);
      if (input.urgency !== undefined) patch.urgency = input.urgency;
      if (input.priority_score !== undefined) patch.priority_score = input.priority_score;
      if (input.area !== undefined) patch.area_id = await resolveAreaId(ctx.userId, input.area);
      if (input.person !== undefined) patch.person_id = await findOrCreateEntity(ctx.userId, "person", input.person);
      const { data, error } = await sb
        .from("tasks")
        .update(patch)
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .select("id, title, status, due_at, next_nudge_at")
        .single();
      if (error) throw new Error(`update_task: ${error.message}`);
      return { ...data, _undo: { task_id: input.task_id, before: prev } };
    },
  },

  {
    name: "complete_task",
    description: "Mark a task done. Stops follow-ups.",
    reversible: true,
    resourceType: "task",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        reason: { type: "string", description: "Optional note on how/why it was completed." },
      },
      required: ["task_id"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const { data: prev } = await sb
        .from("tasks")
        .select("status, completed_at, next_nudge_at")
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      const { data, error } = await sb
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString(), next_nudge_at: null })
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .select("id, title, status")
        .single();
      if (error) throw new Error(`complete_task: ${error.message}`);
      return { ...data, _undo: { task_id: input.task_id, before: prev } };
    },
  },

  {
    name: "snooze_task",
    description: "Snooze a task to a later time. Sets it back to open and reschedules the next nudge.",
    reversible: true,
    resourceType: "task",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        until: { type: "string", description: "ISO-8601 time to resurface the task." },
        reason: { type: "string", description: "Why it's being postponed (the user's stated reason)." },
      },
      required: ["task_id", "until"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const until = toIso(input.until);
      if (!until) throw new Error("snooze_task: invalid 'until'");
      const { data, error } = await sb
        .from("tasks")
        .update({ status: "open", next_nudge_at: until })
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .select("id, title, status, next_nudge_at")
        .single();
      if (error) throw new Error(`snooze_task: ${error.message}`);
      return { ...data };
    },
  },

  {
    name: "drop_task",
    description: "Stop chasing a task without completing it.",
    reversible: true,
    resourceType: "task",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        reason: { type: "string", description: "Why it's being dropped (the user's stated reason)." },
      },
      required: ["task_id"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const { data: prev } = await sb
        .from("tasks")
        .select("status, next_nudge_at")
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      const { data, error } = await sb
        .from("tasks")
        .update({ status: "dropped", next_nudge_at: null })
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .select("id, title, status")
        .single();
      if (error) throw new Error(`drop_task: ${error.message}`);
      return { ...data, _undo: { task_id: input.task_id, before: prev } };
    },
  },

  {
    name: "list_tasks",
    description: "List the user's tasks, optionally filtered by status. Defaults to active tasks.",
    reversible: true,
    input_schema: {
      type: "object",
      properties: {
        status: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
      },
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const statuses: string[] = input.status?.length
        ? input.status
        : ["open", "reminded", "escalated", "snoozed"];
      const { data, error } = await sb
        .from("tasks")
        .select("id, title, status, due_at, next_nudge_at, urgency, priority_score")
        .eq("user_id", ctx.userId)
        .in("status", statuses)
        .order("priority_score", { ascending: false })
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(input.limit ?? 25);
      if (error) throw new Error(`list_tasks: ${error.message}`);
      return { tasks: data ?? [] };
    },
  },

  {
    name: "schedule_followup",
    description: "Set when the follow-up engine should next chase a task.",
    reversible: true,
    resourceType: "task",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        when: { type: "string", description: "ISO-8601." },
      },
      required: ["task_id", "when"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const when = toIso(input.when);
      if (!when) throw new Error("schedule_followup: invalid 'when'");
      const { data, error } = await sb
        .from("tasks")
        .update({ next_nudge_at: when })
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .select("id, title, next_nudge_at")
        .single();
      if (error) throw new Error(`schedule_followup: ${error.message}`);
      return { ...data };
    },
  },

  {
    name: "log_capture",
    description: "Persist the raw intake so the original is never lost. Call on every inbound capture.",
    reversible: true,
    resourceType: "capture",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        source: { type: "string", description: "e.g. telegram, voice, dashboard." },
      },
      required: ["text"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("captures")
        .insert({ user_id: ctx.userId, source: input.source ?? "telegram", raw_text: input.text })
        .select("id")
        .single();
      if (error) throw new Error(`log_capture: ${error.message}`);
      await storeMemory({ userId: ctx.userId, sourceType: "capture", sourceId: data!.id, text: input.text });
      return { capture_id: data!.id };
    },
  },

  {
    name: "search_memory",
    description: "Search ambient memory (past captures, notes, interactions) by meaning.",
    reversible: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    handler: async (input, ctx) => {
      const hits = await searchMemory({ userId: ctx.userId, query: input.query, limit: input.limit ?? 8 });
      return { results: hits.map((h) => ({ text: h.text, similarity: Number(h.similarity.toFixed(3)) })) };
    },
  },

  {
    name: "log_habit",
    description: "Log a habit occurrence for today (e.g. 'did my reading'). Creates the habit if new.",
    reversible: true,
    resourceType: "habit",
    input_schema: {
      type: "object",
      properties: {
        habit: { type: "string" },
        area: { type: "string" },
        count: { type: "number" },
      },
      required: ["habit"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const areaId = await resolveAreaId(ctx.userId, input.area);
      let { data: habit } = await sb
        .from("habits")
        .select("id")
        .eq("user_id", ctx.userId)
        .ilike("name", input.habit.trim())
        .limit(1)
        .maybeSingle();
      if (!habit) {
        const ins = await sb
          .from("habits")
          .insert({ user_id: ctx.userId, name: input.habit.trim(), area_id: areaId })
          .select("id")
          .single();
        habit = ins.data;
      }
      const today = userToday();
      const inc = input.count ?? 1;
      const { data: existing } = await sb
        .from("habit_logs")
        .select("id, count")
        .eq("user_id", ctx.userId)
        .eq("habit_id", habit!.id)
        .eq("log_date", today)
        .maybeSingle();
      if (existing) {
        await sb.from("habit_logs").update({ count: (existing.count ?? 0) + inc }).eq("id", existing.id);
      } else {
        await sb.from("habit_logs").insert({ user_id: ctx.userId, habit_id: habit!.id, log_date: today, count: inc });
      }
      return { habit: input.habit, date: today };
    },
  },

  {
    name: "log_expense",
    description: "Log an expense (e.g. 'spent 25k IQD on lunch'). Just record what the user reports — no budgeting targets.",
    reversible: true,
    resourceType: "expense",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        currency: { type: "string" },
        category: { type: "string" },
        note: { type: "string" },
        spent_at: { type: "string" },
      },
      required: ["amount"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("expenses")
        .insert({
          user_id: ctx.userId,
          amount: input.amount,
          currency: input.currency ?? "USD",
          category: input.category ?? null,
          note: input.note ?? null,
          spent_at: toIso(input.spent_at) ?? new Date().toISOString(),
        })
        .select("id, amount, currency, category")
        .single();
      if (error) throw new Error(`log_expense: ${error.message}`);
      return { ...data };
    },
  },

  {
    name: "log_checkin",
    description: "Record a life-area check-in response.",
    reversible: true,
    resourceType: "checkin",
    input_schema: {
      type: "object",
      properties: {
        area: { type: "string" },
        response: { type: "string" },
        structured: { type: "object" },
        prompt: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD; defaults to today." },
      },
      required: ["area", "response"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const areaId = await resolveAreaId(ctx.userId, input.area);
      const { data, error } = await sb
        .from("checkins")
        .insert({
          user_id: ctx.userId,
          area_id: areaId,
          checkin_date: input.date ?? userToday(),
          prompt: input.prompt ?? null,
          response: input.response,
          structured: input.structured ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(`log_checkin: ${error.message}`);
      await storeMemory({ userId: ctx.userId, sourceType: "checkin", sourceId: data!.id, text: `${input.area}: ${input.response}` });
      return { checkin_id: data!.id, area: input.area };
    },
  },

  {
    name: "upsert_person",
    description:
      "Create or update a contact (CRM): name, role, organization, email, phone, and relationship/context. Merges into any existing details — call it whenever you learn something new about a person.",
    reversible: true,
    resourceType: "person",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        role: { type: "string" },
        organization: { type: "string" },
        phone: { type: "string" },
        context: { type: "string", description: "Relationship / how the user knows them / notes." },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const id = await findOrCreateEntity(ctx.userId, "person", input.name);
      if (id) {
        const { data: cur } = await sb.from("entities").select("metadata").eq("id", id).maybeSingle();
        const meta: Record<string, unknown> = { ...((cur?.metadata as any) ?? {}) };
        for (const k of ["email", "role", "organization", "phone", "context"] as const) {
          if (input[k]) meta[k] = input[k];
        }
        await sb.from("entities").update({ metadata: meta }).eq("id", id);
      }
      return { person_id: id, name: input.name };
    },
  },

  {
    name: "set_email_mode",
    description:
      "Configure an AREA's default email behavior (send vs draft-only). This changes a SETTING only — it never sends any email. To send a drafted reply, use send_pending_reply. Default for every area is draft-only.",
    reversible: true,
    resourceType: "area",
    input_schema: {
      type: "object",
      properties: {
        area: { type: "string" },
        mode: { type: "string", enum: ["draft_only", "send"] },
      },
      required: ["area", "mode"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const areaId = await resolveAreaId(ctx.userId, input.area);
      if (!areaId) return { error: "Unknown area." };
      const { data: cur } = await sb.from("entities").select("metadata").eq("id", areaId).maybeSingle();
      const meta = { ...((cur?.metadata as any) ?? {}), email_mode: input.mode };
      await sb.from("entities").update({ metadata: meta }).eq("id", areaId);
      return { area: input.area, email_mode: input.mode };
    },
  },

  {
    name: "send_pending_reply",
    description:
      "Send the most-recent pending EMAIL DRAFT — use ONLY when the user explicitly approves sending it (e.g. 'send it', 'yes, send the reply'). Respects the area's send/draft-only mode. Never use set_email_mode to send.",
    reversible: true,
    resourceType: "email",
    input_schema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const { sendLatestPendingReply } = await import("@/lib/email/process");
      return { status: await sendLatestPendingReply(ctx.userId) };
    },
  },

  {
    name: "get_pending_reply",
    description: "Read the most-recent pending email draft (recipient, subject, body), if one exists.",
    reversible: true,
    input_schema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const { getLatestPendingReply } = await import("@/lib/email/process");
      const p = await getLatestPendingReply(ctx.userId);
      if (!p) return { pending: false };
      return { pending: true, to: p.payload.to, subject: p.payload.subject, body: p.payload.body };
    },
  },

  {
    name: "cancel_pending_reply",
    description: "Cancel/discard the most-recent pending email draft.",
    reversible: true,
    resourceType: "email",
    input_schema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const { cancelLatestPendingReply } = await import("@/lib/email/process");
      return { status: await cancelLatestPendingReply(ctx.userId) };
    },
  },

  {
    name: "log_interaction",
    description: "Record a touch with a person and when to reconnect next. Infer a sensible cadence if not given.",
    reversible: true,
    resourceType: "interaction",
    input_schema: {
      type: "object",
      properties: {
        person: { type: "string" },
        kind: { type: "string", description: "e.g. call, message, met." },
        summary: { type: "string" },
        occurred_at: { type: "string" },
        next_touch_at: { type: "string" },
        cadence_days: { type: "number", description: "Days until next reconnect, if next_touch_at not given." },
      },
      required: ["person"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const personId = await findOrCreateEntity(ctx.userId, "person", input.person);
      let nextTouch = toIso(input.next_touch_at);
      if (!nextTouch && input.cadence_days) {
        nextTouch = new Date(Date.now() + input.cadence_days * 86400000).toISOString();
      }
      const { data, error } = await sb
        .from("interactions")
        .insert({
          user_id: ctx.userId,
          person_id: personId,
          kind: input.kind ?? null,
          summary: input.summary ?? null,
          occurred_at: toIso(input.occurred_at) ?? new Date().toISOString(),
          next_touch_at: nextTouch,
        })
        .select("id")
        .single();
      if (error) throw new Error(`log_interaction: ${error.message}`);
      if (input.summary) {
        await storeMemory({ userId: ctx.userId, sourceType: "interaction", sourceId: data!.id, text: `${input.person}: ${input.summary}` });
      }
      return { interaction_id: data!.id, person: input.person, next_touch_at: nextTouch };
    },
  },

  {
    name: "list_stale_relationships",
    description: "List people the user is due to reconnect with (next_touch_at has passed).",
    reversible: true,
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("interactions")
        .select("id, summary, next_touch_at, person:entities!interactions_person_id_fkey(name)")
        .eq("user_id", ctx.userId)
        .lte("next_touch_at", new Date().toISOString())
        .order("next_touch_at", { ascending: true })
        .limit(input.limit ?? 10);
      if (error) throw new Error(`list_stale_relationships: ${error.message}`);
      return { stale: data ?? [] };
    },
  },

  {
    name: "list_calendar_events",
    description: "List upcoming calendar events. (Calendar integration arrives in Part 2.)",
    reversible: true,
    input_schema: { type: "object", properties: {} },
    handler: async () => ({ connected: false, note: "Calendar isn't connected yet (Part 2)." }),
  },

  {
    name: "summarize_inbox",
    description: "Summarise recent unread email grouped by urgency. (Email integration arrives in Part 4.)",
    reversible: true,
    input_schema: { type: "object", properties: {} },
    handler: async () => ({ connected: false, note: "Email isn't connected yet (Part 4)." }),
  },

  {
    name: "delegate_task",
    description:
      "Mark a task as delegated to someone else. Keep following up with the USER (not the delegate) until they confirm it's fully complete.",
    reversible: true,
    resourceType: "task",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        person: { type: "string", description: "Who it's delegated to." },
        next_check_in: { type: "string", description: "ISO-8601 next check; defaults to ~1 day." },
      },
      required: ["task_id", "person"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const next = toIso(input.next_check_in) ?? new Date(Date.now() + 86400000).toISOString();
      const { data, error } = await sb
        .from("tasks")
        .update({ delegated_to: input.person, status: "open", next_nudge_at: next })
        .eq("id", input.task_id)
        .eq("user_id", ctx.userId)
        .select("id, title, delegated_to, next_nudge_at")
        .single();
      if (error) throw new Error(`delegate_task: ${error.message}`);
      return { ...data };
    },
  },

  {
    name: "create_plan",
    description:
      "Create a short / medium / long-term plan and set a review cadence (short≈weekly, medium≈monthly, long≈quarterly) unless next_review is given.",
    reversible: true,
    resourceType: "plan",
    input_schema: {
      type: "object",
      properties: {
        horizon: { type: "string", enum: ["short", "medium", "long"] },
        title: { type: "string" },
        body: { type: "string", description: "The plan details / milestones." },
        next_review: { type: "string", description: "ISO-8601 first review; optional." },
      },
      required: ["horizon", "title"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const days = input.horizon === "short" ? 7 : input.horizon === "medium" ? 30 : 90;
      const nextReview = toIso(input.next_review) ?? new Date(Date.now() + days * 86400000).toISOString();
      const { data, error } = await sb
        .from("plans")
        .insert({
          user_id: ctx.userId,
          horizon: input.horizon,
          title: input.title,
          body: input.body ?? null,
          next_review_at: nextReview,
        })
        .select("id, horizon, title, next_review_at")
        .single();
      if (error) throw new Error(`create_plan: ${error.message}`);
      await storeMemory({
        userId: ctx.userId,
        sourceType: "plan",
        sourceId: data!.id,
        text: `${input.horizon} plan: ${input.title}. ${input.body ?? ""}`,
      });
      return { ...data };
    },
  },

  {
    name: "list_plans",
    description: "List the user's plans, optionally filtered by horizon.",
    reversible: true,
    input_schema: {
      type: "object",
      properties: {
        horizon: { type: "string", enum: ["short", "medium", "long"] },
        status: { type: "string", enum: ["active", "done", "archived"] },
      },
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      let q = sb
        .from("plans")
        .select("id, horizon, title, body, status, next_review_at")
        .eq("user_id", ctx.userId)
        .eq("status", input.status ?? "active")
        .order("created_at", { ascending: false })
        .limit(25);
      if (input.horizon) q = q.eq("horizon", input.horizon);
      const { data, error } = await q;
      if (error) throw new Error(`list_plans: ${error.message}`);
      return { plans: data ?? [] };
    },
  },

  {
    name: "update_plan",
    description: "Edit a plan, advance its next review, or complete/archive it.",
    reversible: true,
    resourceType: "plan",
    input_schema: {
      type: "object",
      properties: {
        plan_id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        status: { type: "string", enum: ["active", "done", "archived"] },
        next_review: { type: "string" },
      },
      required: ["plan_id"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.body !== undefined) patch.body = input.body;
      if (input.status !== undefined) patch.status = input.status;
      if (input.next_review !== undefined) patch.next_review_at = toIso(input.next_review);
      const { data, error } = await sb
        .from("plans")
        .update(patch)
        .eq("id", input.plan_id)
        .eq("user_id", ctx.userId)
        .select("id, title, status, next_review_at")
        .single();
      if (error) throw new Error(`update_plan: ${error.message}`);
      return { ...data };
    },
  },

  {
    name: "send_message",
    description:
      "Proactively send the user a Telegram message OUTSIDE of a direct reply (e.g. during a scheduled task). Do NOT use this to answer the user's current message — just return your reply text for that.",
    reversible: true,
    input_schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    handler: async (input, ctx) => {
      await sendMessage(input.text, { chatId: ctx.chatId });
      return { sent: true };
    },
  },

  // --- CALENDAR / MEETINGS (personal tracking — reversible) ----------------

  {
    name: "create_meeting",
    description:
      "Schedule a meeting/appointment/call on the user's calendar. Use for anything time-blocked. Resolve relative times to ISO WITH the offset. The agent reminds the user before it starts (default 30 min) and it appears on their synced Google/iOS calendar.",
    reversible: true,
    resourceType: "meeting",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "ISO-8601 start with offset. Required." },
        end: { type: "string", description: "ISO-8601 end. Optional; defaults to 1h after start." },
        location: { type: "string" },
        notes: { type: "string" },
        area: { type: "string", description: "One of the seven life areas." },
        person: { type: "string", description: "Who the meeting is with." },
        remind_minutes_before: { type: "number", description: "Reminder lead time in minutes. Default 30." },
      },
      required: ["title", "start"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const startIso = toIso(input.start);
      if (!startIso) throw new Error("create_meeting: invalid 'start'");
      const endIso = toIso(input.end) ?? new Date(new Date(startIso).getTime() + 3600000).toISOString();
      const lead = Number.isFinite(input.remind_minutes_before)
        ? Math.max(0, Math.round(input.remind_minutes_before))
        : 30;
      const remindAt = new Date(new Date(startIso).getTime() - lead * 60000).toISOString();
      const areaId = await findOrCreateEntity(ctx.userId, "area", input.area);
      const personId = await findOrCreateEntity(ctx.userId, "person", input.person);
      const { data, error } = await sb
        .from("meetings")
        .insert({
          user_id: ctx.userId,
          title: input.title,
          location: input.location ?? null,
          notes: input.notes ?? null,
          area_id: areaId,
          person_id: personId,
          starts_at: startIso,
          ends_at: endIso,
          remind_minutes_before: lead,
          next_reminder_at: remindAt,
        })
        .select("id, title, starts_at, ends_at, next_reminder_at")
        .single();
      if (error) throw new Error(`create_meeting: ${error.message}`);
      return data;
    },
  },

  {
    name: "list_meetings",
    description: "List the user's meetings — upcoming by default, or recent past ones.",
    reversible: true,
    input_schema: {
      type: "object",
      properties: {
        when: { type: "string", enum: ["upcoming", "past", "all"], description: "Default upcoming." },
        limit: { type: "number" },
      },
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const limit = Math.min(50, Number(input.limit) || 20);
      const nowIso = new Date().toISOString();
      let q = sb
        .from("meetings")
        .select("id, title, starts_at, ends_at, location, status")
        .eq("user_id", ctx.userId)
        .neq("status", "cancelled");
      if (input.when === "past") q = q.lt("starts_at", nowIso).order("starts_at", { ascending: false });
      else if (input.when === "all") q = q.order("starts_at", { ascending: true });
      else q = q.gte("starts_at", nowIso).order("starts_at", { ascending: true });
      const { data, error } = await q.limit(limit);
      if (error) throw new Error(`list_meetings: ${error.message}`);
      return { meetings: data ?? [] };
    },
  },

  {
    name: "update_meeting",
    description:
      "Reschedule or edit a meeting (time, title, location, notes, reminder lead, area, person). Rescheduling re-arms the reminder.",
    reversible: true,
    resourceType: "meeting",
    input_schema: {
      type: "object",
      properties: {
        meeting_id: { type: "string" },
        title: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        location: { type: "string" },
        notes: { type: "string" },
        area: { type: "string" },
        person: { type: "string" },
        remind_minutes_before: { type: "number" },
      },
      required: ["meeting_id"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const { data: prev } = await sb
        .from("meetings")
        .select("starts_at, remind_minutes_before")
        .eq("id", input.meeting_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.location !== undefined) patch.location = input.location;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.area !== undefined) patch.area_id = await findOrCreateEntity(ctx.userId, "area", input.area);
      if (input.person !== undefined) patch.person_id = await findOrCreateEntity(ctx.userId, "person", input.person);
      if (input.start !== undefined) {
        const s = toIso(input.start);
        if (s) patch.starts_at = s;
      }
      if (input.end !== undefined) patch.ends_at = toIso(input.end);
      const leadGiven = Number.isFinite(input.remind_minutes_before);
      const effLead = leadGiven
        ? Math.max(0, Math.round(input.remind_minutes_before))
        : (prev?.remind_minutes_before ?? 30);
      if (leadGiven) patch.remind_minutes_before = effLead;
      const effStart = (patch.starts_at as string | undefined) ?? prev?.starts_at;
      if ((patch.starts_at || leadGiven) && effStart) {
        patch.next_reminder_at = new Date(new Date(effStart).getTime() - effLead * 60000).toISOString();
        patch.reminded = false; // re-arm so the rescheduled meeting reminds again
      }
      const { data, error } = await sb
        .from("meetings")
        .update(patch)
        .eq("id", input.meeting_id)
        .eq("user_id", ctx.userId)
        .select("id, title, starts_at, ends_at, next_reminder_at")
        .single();
      if (error) throw new Error(`update_meeting: ${error.message}`);
      return { ...data, _undo: { meeting_id: input.meeting_id, before: prev } };
    },
  },

  {
    name: "cancel_meeting",
    description: "Cancel a meeting. Stops its reminder and removes it from the synced calendar.",
    reversible: true,
    resourceType: "meeting",
    input_schema: {
      type: "object",
      properties: {
        meeting_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["meeting_id"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("meetings")
        .update({ status: "cancelled", next_reminder_at: null })
        .eq("id", input.meeting_id)
        .eq("user_id", ctx.userId)
        .select("id, title, status")
        .single();
      if (error) throw new Error(`cancel_meeting: ${error.message}`);
      return data;
    },
  },

  {
    name: "import_calendar",
    description:
      "Subscribe to one of the user's OTHER calendars (Apple/iCloud or Google) by its published .ics or webcal URL and import its events into their agent calendar. Use when the user gives a calendar link to sync IN (e.g. 'import my apple calendar <url>'). One-way: their calendar → the agent.",
    reversible: true,
    resourceType: "calendar_source",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The .ics or webcal:// subscription URL." },
        label: { type: "string", description: "A short name, e.g. 'iCloud' or 'Google'." },
      },
      required: ["url"],
    },
    handler: async (input, ctx) => {
      const { id, imported } = await addCalendarSource(ctx.userId, input.url, input.label);
      return {
        id,
        imported,
        message: `Imported ${imported} event(s); this calendar will keep syncing automatically.`,
      };
    },
  },

  {
    name: "list_calendar_imports",
    description: "List the external calendars currently being imported into the agent calendar.",
    reversible: true,
    input_schema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const sb = supabaseAdmin();
      const { data } = await sb
        .from("calendar_sources")
        .select("id,url,label,last_synced_at,last_status")
        .eq("user_id", ctx.userId)
        .eq("active", true)
        .order("created_at", { ascending: true });
      return { sources: data ?? [] };
    },
  },

  {
    name: "remove_calendar_import",
    description:
      "Stop importing an external calendar (by id or URL) and remove the events it brought in.",
    reversible: true,
    resourceType: "calendar_source",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, url: { type: "string" } },
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      let q = sb.from("calendar_sources").select("id").eq("user_id", ctx.userId);
      if (input.id) q = q.eq("id", input.id);
      else if (input.url) q = q.eq("url", String(input.url).trim());
      else throw new Error("remove_calendar_import: id or url required");
      const { data: src } = await q.maybeSingle();
      if (!src) return { removed: false, message: "No matching calendar import found." };
      await sb.from("calendar_sources").update({ active: false }).eq("id", src.id);
      const { data: del } = await sb
        .from("meetings")
        .delete()
        .eq("user_id", ctx.userId)
        .like("external_uid", `${src.id}:%`)
        .select("id");
      return { removed: true, deleted_events: del?.length ?? 0 };
    },
  },

  // --- IRREVERSIBLE — routed through the confirmation gate -----------------

  {
    name: "send_email",
    description: "Send an email. IRREVERSIBLE — routed through the confirmation gate.",
    reversible: false,
    resourceType: "email",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
    handler: async (input) => ({ sent: false, note: "Email sending is wired up in Part 4.", echo: input }),
  },

  {
    name: "send_message_external",
    description: "Send a message to someone OTHER than the user on an external channel. IRREVERSIBLE — gated.",
    reversible: false,
    resourceType: "external_message",
    input_schema: {
      type: "object",
      properties: {
        channel: { type: "string" },
        to: { type: "string" },
        text: { type: "string" },
      },
      required: ["to", "text"],
    },
    handler: async (input) => ({ sent: false, note: "External messaging is wired up later.", echo: input }),
  },

  {
    name: "create_calendar_event_with_guests",
    description: "Create a calendar event that invites other people. IRREVERSIBLE — gated.",
    reversible: false,
    resourceType: "calendar_event",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        guests: { type: "array", items: { type: "string" } },
      },
      required: ["title", "start"],
    },
    handler: async (input) => ({ created: false, note: "Calendar invites are wired up in Part 2.", echo: input }),
  },

  {
    name: "make_booking",
    description: "Make a booking/reservation. IRREVERSIBLE — gated. (Part 5.)",
    reversible: false,
    resourceType: "booking",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string" },
        details: { type: "object" },
      },
      required: ["kind"],
    },
    handler: async (input) => ({ booked: false, note: "Bookings arrive in Part 5.", echo: input }),
  },

  {
    name: "computer_action",
    description: "Perform a computer-use action. IRREVERSIBLE — gated, requires approval for every step. (Part 5.)",
    reversible: false,
    resourceType: "computer_action",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string" },
        details: { type: "object" },
      },
      required: ["action"],
    },
    handler: async (input) => ({ done: false, note: "Computer control arrives in Part 5.", echo: input }),
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDef | undefined {
  return BY_NAME.get(name);
}

// Shape the registry for the Anthropic Messages API.
export function anthropicTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

// A short human summary of a pending irreversible action, for the approval prompt.
export function describeAction(name: string, input: any): string {
  switch (name) {
    case "send_email":
      return `Send email to ${input.to}\nSubject: ${input.subject}\n\n${(input.body ?? "").slice(0, 600)}`;
    case "send_message_external":
      return `Send a ${input.channel ?? "message"} to ${input.to}:\n\n${(input.text ?? "").slice(0, 600)}`;
    case "create_calendar_event_with_guests":
      return `Create event "${input.title}" at ${input.start}${input.guests?.length ? `\nGuests: ${input.guests.join(", ")}` : ""}`;
    case "make_booking":
      return `Make a ${input.kind} booking:\n${JSON.stringify(input.details ?? {}, null, 2).slice(0, 600)}`;
    case "computer_action":
      return `Computer action: ${input.action}\n${JSON.stringify(input.details ?? {}, null, 2).slice(0, 600)}`;
    default:
      return `${name}: ${JSON.stringify(input).slice(0, 600)}`;
  }
}
