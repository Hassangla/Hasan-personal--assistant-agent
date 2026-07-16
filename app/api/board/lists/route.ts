import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Manage the board's custom lists (columns). One endpoint, action-dispatched:
//   create  {name, color?}                 → append a list
//   update  {id, name?, color?, is_done?}  → rename / recolor / set done-list
//   reorder {ordered_ids}                  → set left→right order
//   delete  {id}                           → remove (its tasks become unassigned
//                                             → the board shows them in the first list)
export const runtime = "nodejs";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const sb = supabaseAdmin();

  if (action === "create") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const color = typeof body.color === "string" && HEX.test(body.color) ? body.color : "#8B9099";
    const { data: last } = await sb
      .from("board_lists")
      .select("position")
      .eq("user_id", USER_ID)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (last?.position ?? -1) + 1;
    const { data, error } = await sb
      .from("board_lists")
      .insert({ user_id: USER_ID, name, color, position, is_done: false })
      .select("id,name,color,position,is_done")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, list: data });
  }

  if (action === "update") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 40);
    if (typeof body.color === "string" && HEX.test(body.color)) patch.color = body.color;
    if (typeof body.is_done === "boolean") {
      // At most one done-list: clear the flag elsewhere first.
      if (body.is_done) await sb.from("board_lists").update({ is_done: false }).eq("user_id", USER_ID);
      patch.is_done = body.is_done;
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    const { error } = await sb.from("board_lists").update(patch).eq("id", id).eq("user_id", USER_ID);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "reorder") {
    const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.filter((x: unknown) => typeof x === "string") : [];
    if (!ids.length) return NextResponse.json({ error: "ordered_ids required" }, { status: 400 });
    await Promise.all(
      ids.map((id: string, i: number) =>
        sb.from("board_lists").update({ position: i }).eq("id", id).eq("user_id", USER_ID),
      ),
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { count } = await sb
      .from("board_lists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID);
    if ((count ?? 0) <= 1) return NextResponse.json({ error: "Keep at least one list." }, { status: 400 });
    // Tasks in this list become unassigned (FK on delete set null); the board
    // surfaces unassigned tasks in the first list.
    const { error } = await sb.from("board_lists").delete().eq("id", id).eq("user_id", USER_ID);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
