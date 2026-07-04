import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toUtcIso } from "@/lib/time";

// Checklist items inside a task: add / toggle / delete. Each item may carry
// its own deadline (parsed in the user's timezone) and label (an area, by
// name). Auth via middleware.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const sb = supabaseAdmin();

  if (action === "add") {
    const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!taskId || !title) return NextResponse.json({ error: "task_id and title required" }, { status: 400 });

    const { data: task } = await sb.from("tasks").select("id").eq("id", taskId).eq("user_id", USER_ID).maybeSingle();
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    let areaId: string | null = null;
    const areaName = typeof body.area === "string" ? body.area.trim() : "";
    if (areaName) {
      const { data: area } = await sb
        .from("entities")
        .select("id")
        .eq("user_id", USER_ID)
        .eq("kind", "area")
        .ilike("name", areaName)
        .limit(1)
        .maybeSingle();
      areaId = (area?.id as string) ?? null;
    }

    const dueIso = toUtcIso(typeof body.due === "string" && body.due.trim() ? body.due.trim() : null);
    const { data: maxPos } = await sb
      .from("task_checklist_items")
      .select("position")
      .eq("task_id", taskId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: row, error } = await sb
      .from("task_checklist_items")
      .insert({
        user_id: USER_ID,
        task_id: taskId,
        title,
        due_at: dueIso,
        area_id: areaId,
        position: ((maxPos?.position as number) ?? -1) + 1,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: row.id });
  }

  if (action === "toggle") {
    const itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
    if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 });
    const { data: item } = await sb
      .from("task_checklist_items")
      .select("id,done")
      .eq("id", itemId)
      .eq("user_id", USER_ID)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    const done = !item.done;
    await sb
      .from("task_checklist_items")
      .update({ done, completed_at: done ? new Date().toISOString() : null })
      .eq("id", itemId)
      .eq("user_id", USER_ID);
    return NextResponse.json({ ok: true, done });
  }

  if (action === "delete") {
    const itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
    if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 });
    await sb.from("task_checklist_items").delete().eq("id", itemId).eq("user_id", USER_ID);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action must be add | toggle | delete" }, { status: 400 });
}
