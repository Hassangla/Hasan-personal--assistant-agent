import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID } from "@/lib/config";

export type GoalTask = { id: string; title: string; status: string; area: string | null };
export type Goal = {
  id: string;
  horizon: string;
  title: string;
  body: string | null;
  total: number;
  done: number;
  tasks: GoalTask[];
};
export type GoalsData = {
  short: Goal[];
  medium: Goal[];
  long: Goal[];
  todayDoneLinked: number; // tasks linked to a goal completed today
  pendingCount: number;
};

export async function getGoalsData(): Promise<GoalsData> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - 16 * 3600000).toISOString(); // ~today

  const [planRes, taskRes, areaRes, pendingRes] = await Promise.all([
    sb
      .from("plans")
      .select("id,horizon,title,body,created_at")
      .eq("user_id", USER_ID)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(60),
    sb
      .from("tasks")
      .select("id,title,status,area_id,goal_id,completed_at")
      .eq("user_id", USER_ID)
      .not("goal_id", "is", null)
      .limit(600),
    sb.from("entities").select("id,name").eq("user_id", USER_ID).eq("kind", "area"),
    sb.from("confirmations").select("id", { count: "exact", head: true }).eq("user_id", USER_ID).eq("status", "pending"),
  ]);

  const areaById = new Map<string, string>();
  for (const a of (areaRes.data ?? []) as any[]) areaById.set(a.id, a.name);

  const tasks = (taskRes.data ?? []) as any[];
  const byGoal = new Map<string, any[]>();
  for (const t of tasks) {
    const arr = byGoal.get(t.goal_id) ?? [];
    arr.push(t);
    byGoal.set(t.goal_id, arr);
  }
  const todayDoneLinked = tasks.filter((t) => t.status === "done" && t.completed_at && t.completed_at >= since).length;

  const goals: Goal[] = ((planRes.data ?? []) as any[]).map((p) => {
    const ts = byGoal.get(p.id) ?? [];
    return {
      id: p.id,
      horizon: p.horizon,
      title: p.title,
      body: p.body ?? null,
      total: ts.length,
      done: ts.filter((t) => t.status === "done").length,
      tasks: ts
        .filter((t) => t.status !== "dropped")
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          area: t.area_id ? areaById.get(t.area_id) ?? null : null,
        })),
    };
  });

  return {
    short: goals.filter((g) => g.horizon === "short"),
    medium: goals.filter((g) => g.horizon === "medium"),
    long: goals.filter((g) => g.horizon === "long"),
    todayDoneLinked,
    pendingCount: pendingRes.count ?? 0,
  };
}
