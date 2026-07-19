import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toUtcIso } from "@/lib/time";

// Edit a task's deadline and/or area:
//   {task_id, due}   — due "" clears it (reminders re-sync if already exported)
//   {task_id, area}  — set the life-area/category; "" clears it
// At least one of due/area is required. If the task's reminder was already
// exported, a due change flags a re-sync (Shortcuts can't edit a reminder in
// place — the next pull removes the stale alert, the one after re-adds it).
export const runtime = "nodejs";

const OPEN = ["open", "reminded", "escalated", "snoozed"];

// Resolve an area name → entity id (create the area entity if it's new).
async function resolveArea(sb: ReturnType<typeof supabaseAdmin>, name: string): Promise<string | null> {
  if (!name) return null;
  const { data: ent } = await sb
    .from("entities")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("kind", "area")
    .ilike("name", name)
    .maybeSingle();
  if (ent) return ent.id as string;
  const { data: created } = await sb
    .from("entities")
    .insert({ user_id: USER_ID, kind: "area", name })
    .select("id")
    .single();
  return (created?.id as string) ?? null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) return NextResponse.json({ error: "task_id required" }, { status: 400 });
  const hasDue = "due" in body;
  const hasArea = "area" in body;
  const hasDesc = "description" in body;
  if (!hasDue && !hasArea && !hasDesc) {
    return NextResponse.json({ error: "provide due, area, and/or description" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: task } = await sb
    .from("tasks")
    .select("id,status,reminders_exported_at")
    .eq("id", taskId)
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (hasDue) {
    const raw = typeof body.due === "string" ? body.due.trim() : "";
    const dueIso = raw ? toUtcIso(raw) : null;
    if (raw && !dueIso) return NextResponse.json({ error: "could not parse due" }, { status: 400 });
    patch.due_at = dueIso;
    if (task.reminders_exported_at && OPEN.includes(task.status)) patch.reminders_resync = true;
  }

  if (hasArea) {
    const name = typeof body.area === "string" ? body.area.trim() : "";
    patch.area_id = await resolveArea(sb, name);
  }

  if (hasDesc) {
    const desc = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : "";
    patch.description = desc || null;
  }

  const { error } = await sb.from("tasks").update(patch).eq("id", taskId).eq("user_id", USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, ...patch });
}
