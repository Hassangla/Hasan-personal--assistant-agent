import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { executeTool } from "@/lib/agent/execute";

// Move a task between To-Do and "I'm Chasing" (Delegated).
//  • { task_id, person }   → delegate (reuses delegate_task: keeps chasing the
//                            person until you confirm done).
//  • { task_id, takeBack } → un-delegate back to To-Do.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) return NextResponse.json({ error: "task_id required" }, { status: 400 });

  if (body.takeBack) {
    const sb = supabaseAdmin();
    const { error } = await sb
      .from("tasks")
      .update({ delegated_to: null, status: "open", next_nudge_at: new Date(Date.now() + 86400000).toISOString() })
      .eq("id", taskId)
      .eq("user_id", USER_ID);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const person = typeof body.person === "string" ? body.person.trim() : "";
  if (!person) return NextResponse.json({ error: "person required to delegate" }, { status: 400 });
  const result = (await executeTool("delegate_task", { task_id: taskId, person }, { userId: USER_ID })) as Record<
    string,
    unknown
  >;
  if (result && typeof result === "object" && "error" in result) {
    return NextResponse.json({ error: String(result.error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
