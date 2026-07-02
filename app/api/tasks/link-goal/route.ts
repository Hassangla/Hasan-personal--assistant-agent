import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Link (or unlink) a task to a goal. Pass goal_id="" to unlink.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) return NextResponse.json({ error: "task_id required" }, { status: 400 });
  const goalId = typeof body.goal_id === "string" && body.goal_id.trim() ? body.goal_id.trim() : null;

  const sb = supabaseAdmin();
  const { error } = await sb.from("tasks").update({ goal_id: goalId }).eq("id", taskId).eq("user_id", USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
