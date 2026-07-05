import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toUtcIso } from "@/lib/time";

// Edit a task's deadline: {task_id, due} — due "" clears it. If the task's
// reminder was already exported, flag a re-sync: the next pull removes the
// old reminder (stale alert), the one after re-adds it with the new time —
// Shortcuts cannot edit a reminder in place.
export const runtime = "nodejs";

const OPEN = ["open", "reminded", "escalated", "snoozed"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) return NextResponse.json({ error: "task_id required" }, { status: 400 });
  if (!("due" in body)) return NextResponse.json({ error: "due required (\"\" clears the deadline)" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: task } = await sb
    .from("tasks")
    .select("id,status,reminders_exported_at")
    .eq("id", taskId)
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

  const raw = typeof body.due === "string" ? body.due.trim() : "";
  const dueIso = raw ? toUtcIso(raw) : null;
  if (raw && !dueIso) return NextResponse.json({ error: "could not parse due" }, { status: 400 });

  const patch: Record<string, unknown> = { due_at: dueIso };
  if (task.reminders_exported_at && OPEN.includes(task.status)) {
    patch.reminders_resync = true; // remove old reminder, then re-add with the new alert
  }
  const { error } = await sb.from("tasks").update(patch).eq("id", taskId).eq("user_id", USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, due: dueIso });
}
