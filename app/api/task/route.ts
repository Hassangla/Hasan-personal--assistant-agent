import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Full detail for one task + the list of active goals (for the link-to-goal
// picker). Powers the task-detail slide-over. Auth via middleware.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: t } = await sb
    .from("tasks")
    .select("id,title,description,status,due_at,created_at,area_id,goal_id,delegated_to,nudge_count")
    .eq("id", id)
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [areaRes, goalRes, goalsRes, reasonRes, filesRes, checklistRes, areasAllRes] = await Promise.all([
    t.area_id
      ? sb.from("entities").select("name").eq("id", t.area_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    t.goal_id ? sb.from("plans").select("title").eq("id", t.goal_id).maybeSingle() : Promise.resolve({ data: null as any }),
    sb
      .from("plans")
      .select("id,title,horizon")
      .eq("user_id", USER_ID)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("audit_log")
      .select("action,payload,created_at")
      .eq("user_id", USER_ID)
      .eq("resource_type", "task")
      .eq("resource_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    sb
      .from("task_files")
      .select("id,name,path,size_bytes,mime")
      .eq("user_id", USER_ID)
      .eq("task_id", id)
      .order("created_at", { ascending: true })
      .limit(30),
    sb
      .from("task_checklist_items")
      .select("id,title,due_at,area_id,done")
      .eq("user_id", USER_ID)
      .eq("task_id", id)
      .order("position", { ascending: true })
      .limit(100),
    sb.from("entities").select("id,name").eq("user_id", USER_ID).eq("kind", "area"),
  ]);

  const areaNameById = new Map<string, string>();
  for (const a of ((areasAllRes.data ?? []) as any[])) areaNameById.set(a.id, a.name);
  const checklist = (((checklistRes.data ?? []) as any[])).map((c) => ({
    id: c.id,
    title: c.title,
    dueIso: c.due_at ?? null,
    area: c.area_id ? areaNameById.get(c.area_id) ?? null : null,
    done: !!c.done,
  }));

  // Short-lived signed URLs for the private bucket (1 hour).
  const files = await Promise.all(
    (((filesRes.data ?? []) as any[])).map(async (f) => {
      const { data: signed } = await sb.storage.from("task-files").createSignedUrl(f.path, 3600);
      return { id: f.id, name: f.name, size: Number(f.size_bytes) || 0, mime: f.mime ?? null, url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({
    task: {
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      status: t.status,
      dueIso: t.due_at ?? null,
      createdIso: t.created_at ?? null,
      areaId: t.area_id ?? null,
      area: (areaRes.data as any)?.name ?? null,
      goalId: t.goal_id ?? null,
      goal: (goalRes.data as any)?.title ?? null,
      delegatedTo: t.delegated_to ?? null,
      nudgeCount: t.nudge_count ?? 0,
      lastReason: ((reasonRes.data ?? [])[0] as any)?.payload?.reason ?? null,
      files,
      checklist,
    },
    goals: ((goalsRes.data ?? []) as any[]).map((g) => ({ id: g.id, title: g.title, horizon: g.horizon })),
  });
}
