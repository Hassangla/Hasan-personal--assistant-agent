import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Persist a list's card order. {list_id, ordered_ids} writes board_position =
// index for each id and sets board_list_id = list_id. If the target list is
// flagged is_done, tasks landing there are completed; a task leaving a done
// list (into a normal list) is reopened.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const listId = typeof body.list_id === "string" ? body.list_id.trim() : "";
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.filter((x: unknown) => typeof x === "string") : [];
  if (!listId) return NextResponse.json({ error: "list_id required" }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: "ordered_ids required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: list } = await sb
    .from("board_lists")
    .select("id,is_done")
    .eq("id", listId)
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });
  const targetDone = !!list.is_done;

  // Current status of the moving tasks (to reopen/complete correctly).
  const { data: rows } = await sb
    .from("tasks")
    .select("id,status")
    .eq("user_id", USER_ID)
    .in("id", ids.slice(0, 300));
  const statusById = new Map(((rows ?? []) as any[]).map((r) => [r.id, r.status]));

  const nowIso = new Date().toISOString();
  await Promise.all(
    ids.slice(0, 300).map((id: string, i: number) => {
      const patch: Record<string, unknown> = { board_list_id: listId, board_position: i };
      const status = statusById.get(id);
      if (targetDone && status && status !== "done") {
        patch.status = "done";
        patch.completed_at = nowIso;
      } else if (!targetDone && status === "done") {
        patch.status = "open";
        patch.completed_at = null;
      }
      return sb.from("tasks").update(patch).eq("id", id).eq("user_id", USER_ID);
    }),
  );
  return NextResponse.json({ ok: true, count: ids.length, done: targetDone });
}
