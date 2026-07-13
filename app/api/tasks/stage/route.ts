import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Move a task between board lanes: {task_id, stage: todo|doing|done}.
// "done" completes for real (same semantics as the complete button — the
// Reminders cleanup queue and archive pick it up). Moving a done task back
// reopens it into the target lane.
export const runtime = "nodejs";

const OPEN = ["open", "reminded", "escalated", "snoozed"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  const stage = typeof body.stage === "string" ? body.stage : "";
  if (!taskId || !["todo", "doing", "done"].includes(stage)) {
    return NextResponse.json({ error: "task_id and stage (todo|doing|done) required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: task } = await sb
    .from("tasks")
    .select("id,status")
    .eq("id", taskId)
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

  const patch: Record<string, unknown> = { board_stage: stage === "done" ? "todo" : stage };
  if (stage === "done") {
    if (OPEN.includes(task.status)) {
      patch.status = "done";
      patch.completed_at = new Date().toISOString();
    }
  } else if (task.status === "done") {
    // Dragged out of Done → reopen into the target lane.
    patch.status = "open";
    patch.completed_at = null;
  }

  const { error } = await sb.from("tasks").update(patch).eq("id", taskId).eq("user_id", USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, stage, status: (patch.status as string) ?? task.status });
}
