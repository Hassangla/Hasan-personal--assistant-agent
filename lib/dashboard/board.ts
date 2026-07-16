import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

// Customizable board columns ("lists"). Users add / rename / recolor / reorder
// / delete them. Exactly one may be flagged is_done — dropping a task there
// completes it (and it shows recent completions).

export type BoardList = { id: string; name: string; color: string; position: number; isDone: boolean };

const DEFAULTS: Omit<BoardList, "id">[] = [
  { name: "To Do", color: "#F3B24C", position: 0, isDone: false },
  { name: "In Progress", color: "#5C8DF0", position: 1, isDone: false },
  { name: "Done", color: "#43D3A2", position: 2, isDone: true },
];

// Fetch the user's lists, seeding the defaults on first use so the board is
// never empty even if the migration seed didn't run for this user.
export async function getBoardLists(userId: string): Promise<BoardList[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("board_lists")
    .select("id,name,color,position,is_done")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  let rows = (data ?? []) as any[];
  if (!rows.length) {
    await sb.from("board_lists").insert(DEFAULTS.map((d) => ({ user_id: userId, name: d.name, color: d.color, position: d.position, is_done: d.isDone })));
    const { data: seeded } = await sb
      .from("board_lists")
      .select("id,name,color,position,is_done")
      .eq("user_id", userId)
      .order("position", { ascending: true });
    rows = (seeded ?? []) as any[];
  }
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position ?? 0, isDone: !!r.is_done }));
}
