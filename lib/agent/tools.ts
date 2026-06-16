import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { storeMemory, searchMemory } from "@/lib/memory";
import { sendMessage } from "@/lib/telegram/client";
import { userToday } from "@/lib/config";
import { sendTaskOptions } from "@/lib/telegram/keyboards";
import { AREAS } from "@/lib/areas";

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

function toIso(value?: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
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

// Default a nudge to fire before the deadline (24h prior, but never in the past).
function defaultNudge(dueIso: string | null): string | null {
  if (!dueIso) return null;
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
      // Buttons-first: when no area was stated, ask via inline area buttons.
      if (!areaId && data) {
        try {
          await sendTaskOptions(data.id as string, input.title, true, ctx.chatId);
        } catch (e) {
          console.error("[create_task] sendTaskOptions failed:", e);
        }
      }
      return { ...data };
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
    description: "Create or update a person in the CRM.",
    reversible: true,
    resourceType: "person",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      const sb = supabaseAdmin();
      const id = await findOrCreateEntity(ctx.userId, "person", input.name);
      if (id && input.metadata) {
        await sb.from("entities").update({ metadata: input.metadata }).eq("id", id);
      }
      return { person_id: id, name: input.name };
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
