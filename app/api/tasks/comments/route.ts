import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Task comments — a running thread of notes on a task.
//   GET  ?task_id=…            → list (oldest first)
//   POST {task_id, body}       → add a comment
//   POST {delete_id}           → remove a comment
export const runtime = "nodejs";

export async function GET(req: Request) {
  const taskId = new URL(req.url).searchParams.get("task_id") ?? "";
  if (!taskId) return NextResponse.json({ error: "task_id required" }, { status: 400 });
  const { data } = await supabaseAdmin()
    .from("task_comments")
    .select("id,body,created_at")
    .eq("user_id", USER_ID)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
    .limit(200);
  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();

  const deleteId = typeof body.delete_id === "string" ? body.delete_id.trim() : "";
  if (deleteId) {
    await sb.from("task_comments").delete().eq("id", deleteId).eq("user_id", USER_ID);
    return NextResponse.json({ ok: true });
  }

  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!taskId || !text) return NextResponse.json({ error: "task_id and body required" }, { status: 400 });

  // Ownership check on the task.
  const { data: task } = await sb.from("tasks").select("id").eq("id", taskId).eq("user_id", USER_ID).maybeSingle();
  if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

  const { data, error } = await sb
    .from("task_comments")
    .insert({ user_id: USER_ID, task_id: taskId, body: text })
    .select("id,body,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, comment: data });
}
