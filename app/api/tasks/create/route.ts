import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { executeTool } from "@/lib/agent/execute";

// Manually add a task (no chat). Reuses create_task so it gets the SAME
// follow-up arming (next_nudge_at), area resolution, priority, and audit as a
// chat-created task. Optionally delegate it on creation.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const created = (await executeTool(
    "create_task",
    {
      title,
      area: typeof body.area === "string" && body.area.trim() ? body.area.trim() : undefined,
      due_at: typeof body.due === "string" && body.due.trim() ? body.due.trim() : undefined,
      urgency: typeof body.urgency === "string" && body.urgency.trim() ? body.urgency.trim() : undefined,
      labels: Array.isArray(body.labels) ? body.labels : undefined,
    },
    { userId: USER_ID },
  )) as Record<string, unknown>;
  if (created && typeof created === "object" && "error" in created) {
    return NextResponse.json({ error: String(created.error) }, { status: 400 });
  }

  // Optionally delegate the freshly-created task (manual add into "I'm Chasing").
  const person = typeof body.delegate_to === "string" ? body.delegate_to.trim() : "";
  if (person && created?.id) {
    await executeTool("delegate_task", { task_id: created.id, person }, { userId: USER_ID });
  }

  // Optionally link it to a goal (manual add under a goal on the Goals page).
  const goalId = typeof body.goal_id === "string" ? body.goal_id.trim() : "";
  if (goalId && created?.id) {
    await supabaseAdmin().from("tasks").update({ goal_id: goalId }).eq("id", created.id).eq("user_id", USER_ID);
  }

  // Optionally drop it straight into a board list (manual add from the board).
  // Guard: never land a new task in a "done" list — that would complete it on
  // arrival. Falls back to leaving it unassigned (shown in the first list).
  const listId = typeof body.board_list_id === "string" ? body.board_list_id.trim() : "";
  if (listId && created?.id) {
    const sb = supabaseAdmin();
    const { data: list } = await sb
      .from("board_lists")
      .select("id,is_done")
      .eq("id", listId)
      .eq("user_id", USER_ID)
      .maybeSingle();
    if (list && !list.is_done) {
      await sb.from("tasks").update({ board_list_id: listId }).eq("id", created.id).eq("user_id", USER_ID);
    }
  }

  return NextResponse.json({ ok: true, task: created });
}
