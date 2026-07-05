import "server-only";
import crypto from "node:crypto";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { executeTool } from "@/lib/agent/execute";
import { toUtcIso } from "@/lib/time";

// Two-way Apple Reminders sync, driven by an iOS Shortcut that calls two
// token-authed endpoints on a schedule (Apple exposes no server API for
// Reminders, so the phone is the bridge):
//   pull — platform tasks the Shortcut should create as reminders (notes carry
//          a "pa:<task id>" marker), plus markers whose reminders it should
//          remove because the task was completed/deleted here.
//   push — reminders the user created on their phone (keyed by the reminder's
//          creation date, stable across renames) → created as real tasks with
//          the same follow-up logic as chat-created ones; also completions of
//          "pa:" reminders → complete the matching task.

const OPEN = ["open", "reminded", "escalated", "snoozed"];

export function remindersToken(userId: string = USER_ID): string {
  const secret = process.env.AUTH_SECRET || "";
  return crypto.createHmac("sha256", secret).update(`reminders:${userId}`).digest("hex").slice(0, 40);
}

export function remindersTokenValid(token: string, userId: string = USER_ID): boolean {
  const expected = remindersToken(userId);
  if (token.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function remindersPullPath(userId: string = USER_ID): string {
  return `/api/reminders/${remindersToken(userId)}/pull`;
}
export function remindersPushPath(userId: string = USER_ID): string {
  return `/api/reminders/${remindersToken(userId)}/push`;
}

export type RemindersPull = {
  add: { id: string; title: string; due: string; notes: string; area: string }[];
  // Tasks completed/deleted on the platform whose reminders should be removed
  // on the phone. title lets the Shortcut match by name (reminders don't
  // reliably carry the pa: marker in notes); marker kept for marker-based
  // setups.
  remove: { marker: string; title: string }[];
};

// dry=true previews without consuming state (used by verification).
export async function pullForReminders(userId: string, dry = false): Promise<RemindersPull> {
  const sb = supabaseAdmin();

  const [addRes, removeRes, areaRes] = await Promise.all([
    sb
      .from("tasks")
      .select("id,title,due_at,area_id")
      .eq("user_id", userId)
      .in("status", OPEN)
      .is("delegated_to", null)
      .is("reminders_exported_at", null)
      .order("created_at", { ascending: true })
      .limit(50),
    sb
      .from("tasks")
      .select("id,title,reminders_resync")
      .eq("user_id", userId)
      .or("status.in.(done,dropped),reminders_resync.is.true")
      .not("reminders_exported_at", "is", null)
      .is("reminders_removed_at", null)
      .limit(50),
    sb.from("entities").select("id,name").eq("user_id", userId).eq("kind", "area"),
  ]);

  const areaById = new Map<string, string>();
  for (const a of (areaRes.data ?? []) as any[]) areaById.set(a.id, a.name);

  // Notes carry the pa: marker plus the area as a #tag so labels travel with
  // the reminder (Reminders has no writable tag field via Shortcuts).
  const add = ((addRes.data ?? []) as any[]).map((t) => {
    const area = t.area_id ? areaById.get(t.area_id) ?? "" : "";
    return {
      id: t.id as string,
      title: t.title as string,
      due: (t.due_at as string) ?? "",
      notes: `pa:${t.id}` + (area ? ` #${area.replace(/\s+/g, "-")}` : ""),
      area,
    };
  });
  const remove = ((removeRes.data ?? []) as any[]).map((t) => ({ marker: `pa:${t.id}`, title: t.title as string }));

  if (!dry) {
    const now = new Date().toISOString();
    if (add.length) {
      // Fresh export = fresh lifecycle (a later completion must be removable).
      await sb
        .from("tasks")
        .update({ reminders_exported_at: now, reminders_removed_at: null })
        .eq("user_id", userId)
        .in("id", add.map((t) => t.id));
    }
    const removeRows = (removeRes.data ?? []) as any[];
    const doneIds = removeRows.filter((t) => !t.reminders_resync).map((t) => t.id);
    const resyncIds = removeRows.filter((t) => t.reminders_resync).map((t) => t.id);
    if (doneIds.length) {
      await sb.from("tasks").update({ reminders_removed_at: now }).eq("user_id", userId).in("id", doneIds);
    }
    if (resyncIds.length) {
      // Old reminder removed this cycle; clearing the export marks re-queues
      // the task so the NEXT cycle re-adds it with the new deadline.
      await sb
        .from("tasks")
        .update({ reminders_resync: false, reminders_exported_at: null, reminders_removed_at: null })
        .eq("user_id", userId)
        .in("id", resyncIds);
    }
  }

  return { add, remove };
}

// Recovery: put every open platform-born task back in the pull queue (e.g.
// after a Shortcut misfire consumed them). Reminder-born tasks (reminders_key
// set) are skipped — they already live in Reminders.
export async function requeueReminders(userId: string): Promise<number> {
  const { data } = await supabaseAdmin()
    .from("tasks")
    .update({ reminders_exported_at: null })
    .eq("user_id", userId)
    .in("status", OPEN)
    .is("delegated_to", null)
    .is("reminders_key", null)
    .not("reminders_exported_at", "is", null)
    .select("id");
  return (data ?? []).length;
}

const MARKER = /pa:([0-9a-f-]{36})/i;

export type RemindersPush =
  | { ok: true; created: string }
  | { ok: true; completed: string }
  | { ok: true; dup: true }
  | { ok: true; noop: true }
  | { ok: true; skipped: string }
  | { ok: false; error: string };

export async function pushFromReminders(userId: string, body: any): Promise<RemindersPush> {
  const sb = supabaseAdmin();

  // Completion of a platform-born reminder: notes carry the pa:<id> marker.
  if (body?.completed === true || body?.completed === "true") {
    const marker = String(body?.notes ?? body?.marker ?? "");
    const m = marker.match(MARKER);
    if (!m) return { ok: true, noop: true }; // completed something we don't track
    const { data: t } = await sb
      .from("tasks")
      .select("id,status")
      .eq("user_id", userId)
      .eq("id", m[1]!)
      .maybeSingle();
    if (!t || !OPEN.includes(t.status)) return { ok: true, noop: true };
    await sb
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("user_id", userId);
    return { ok: true, completed: t.id };
  }

  // New reminder created on the phone → create a real task (once).
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!title) return { ok: false, error: "title required" };
  if (!key) return { ok: false, error: "key required (reminder creation date)" };
  // The classic Shortcuts trap: typed placeholder words instead of the blue
  // variable token. Reject loudly so the Shortcut's own output says what's
  // wrong instead of silently creating a junk task.
  const LITERAL = /^(repeat item|repeat item name|repeat item creation date|name|creation date|date created|due date)$/i;
  if (LITERAL.test(title)) {
    return { ok: false, error: `title is the literal text "${title}" — insert the blue Repeat Item variable, not typed words` };
  }
  if (LITERAL.test(key)) {
    return { ok: false, error: `key is the literal text "${key}" — insert the Repeat Item ▸ Creation Date variable, not typed words` };
  }
  if (MARKER.test(String(body?.notes ?? ""))) return { ok: true, noop: true }; // platform-born, never echo

  // Flood backstop: a Shortcut filter mishap once pushed a 224-item backlog of
  // old reminders. If the key parses as a date older than 60 days, skip it
  // (200, so the Shortcut's loop keeps going) unless force:true is sent for an
  // intentional backlog import. Unparseable keys stay opaque and pass through.
  const force = body?.force === true || body?.force === "true";
  if (!force) {
    const keyMs = Date.parse(key.replace(/\bat\b/i, " ").replace(/\s+/g, " "));
    if (!Number.isNaN(keyMs) && Date.now() - keyMs > 60 * 86400000) {
      return { ok: true, skipped: "reminder older than 60 days — send force:true to import backlog intentionally" };
    }
  }

  const { data: existing } = await sb
    .from("tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("reminders_key", key)
    .maybeSingle();
  if (existing) return { ok: true, dup: true };

  const dueIso = toUtcIso(typeof body?.due === "string" && body.due.trim() ? body.due.trim() : null);
  const created = (await executeTool(
    "create_task",
    { title, due_at: dueIso ?? undefined },
    { userId },
  )) as Record<string, unknown>;
  if (!created || typeof created !== "object" || !created.id || "error" in created) {
    return { ok: false, error: String((created as any)?.error ?? "could not create task") };
  }

  // Already lives in Reminders — mark exported so pull never echoes it back.
  await sb
    .from("tasks")
    .update({ reminders_key: key, reminders_exported_at: new Date().toISOString() })
    .eq("id", created.id as string)
    .eq("user_id", userId);

  return { ok: true, created: created.id as string };
}
