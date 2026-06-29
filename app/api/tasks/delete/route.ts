import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { executeTool } from "@/lib/agent/execute";

// Delete (drop) a task from the dashboard — distinct from completing it. Reuses
// the agent's drop_task tool: status → dropped, nudges stopped, audit_log row
// with an undo payload. Auth via middleware.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) return NextResponse.json({ error: "task_id required" }, { status: 400 });

  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Deleted from the dashboard.";
  const result = (await executeTool("drop_task", { task_id: taskId, reason }, { userId: USER_ID })) as Record<
    string,
    unknown
  >;
  if (result && typeof result === "object" && "error" in result) {
    return NextResponse.json({ error: String(result.error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
