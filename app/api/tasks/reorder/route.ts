import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Persist a lane's manual card order. {stage: todo|doing, ordered_ids} writes
// board_position = index for each id (clean integers, no float drift) and sets
// board_stage. A card dragged out of Done into a positioned slot also reopens
// (status done → open). Completion (dropping INTO Done) stays on /stage.
export const runtime = "nodejs";

const LANES = ["todo", "doing"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const stage = typeof body.stage === "string" ? body.stage : "";
  const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.filter((x: unknown) => typeof x === "string") : [];
  if (!LANES.includes(stage)) return NextResponse.json({ error: "stage must be todo|doing" }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: "ordered_ids required" }, { status: 400 });

  const sb = supabaseAdmin();
  // Which of these are currently done (need reopening as they land in a lane)?
  const { data: rows } = await sb
    .from("tasks")
    .select("id,status")
    .eq("user_id", USER_ID)
    .in("id", ids.slice(0, 300));
  const doneIds = new Set(((rows ?? []) as any[]).filter((r) => r.status === "done").map((r) => r.id));

  await Promise.all(
    ids.slice(0, 300).map((id: string, i: number) => {
      const patch: Record<string, unknown> = { board_stage: stage, board_position: i };
      if (doneIds.has(id)) {
        patch.status = "open";
        patch.completed_at = null;
      }
      return sb.from("tasks").update(patch).eq("id", id).eq("user_id", USER_ID);
    }),
  );
  return NextResponse.json({ ok: true, count: ids.length });
}
