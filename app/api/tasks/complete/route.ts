import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { executeTool } from "@/lib/agent/execute";

// Mark a task done from the dashboard. Reuses the agent's complete_task tool so
// the behavior is identical to completing via Telegram: status→done, completed_at
// set, follow-up nudges stopped, and an audit_log row written (with undo payload).
// Auth is enforced by middleware (session cookie or x-api-secret header).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) {
    return NextResponse.json({ error: "task_id required" }, { status: 400 });
  }

  const result = (await executeTool(
    "complete_task",
    { task_id: taskId, reason: "Completed from the dashboard." },
    { userId: USER_ID },
  )) as Record<string, unknown>;

  if (result && typeof result === "object" && "error" in result) {
    return NextResponse.json({ error: String(result.error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, task: result });
}
