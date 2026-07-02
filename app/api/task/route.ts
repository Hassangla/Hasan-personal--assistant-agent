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

  const [areaRes, goalRes, goalsRes, reasonRes] = await Promise.all([
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
  ]);

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
    },
    goals: ((goalsRes.data ?? []) as any[]).map((g) => ({ id: g.id, title: g.title, horizon: g.horizon })),
  });
}
