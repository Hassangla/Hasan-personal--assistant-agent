import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID, USER_TIMEZONE } from "@/lib/config";
import { areaMeta } from "@/lib/areas";

export type AreaStat = {
  area: string;
  label: string;
  color: string;
  open: number;
  done: number;
  overdue: number;
  escalated: number;
  behind: boolean;
};
export type DayBar = { label: string; count: number };
export type ProductivityData = {
  completedTotal: number;
  completedWeek: number;
  completedToday: number;
  openTotal: number;
  overdue: number;
  dueToday: number;
  delegated: number;
  followups: number;
  dropped: number;
  completionRate: number; // %
  avgNudges: number;
  maxTrend: number;
  trend: DayBar[];
  byArea: AreaStat[];
  behind: AreaStat[];
  delayedCount: number;
  avgDelayDays: number;
  maxDelayDays: number;
  topDelays: { title: string; label: string; color: string; days: number }[];
  delaysByArea: { label: string; color: string; count: number; avgDays: number; maxDays: number }[];
  pendingCount: number;
};

function tzDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Whole calendar days between two YYYY-MM-DD strings.
function dayDiff(fromYmd: string, toYmd: string): number {
  const f = fromYmd.split("-").map(Number);
  const t = toYmd.split("-").map(Number);
  return Math.round((Date.UTC(t[0]!, t[1]! - 1, t[2]!) - Date.UTC(f[0]!, f[1]! - 1, f[2]!)) / 86400000);
}

export async function getProductivityData(): Promise<ProductivityData> {
  const sb = supabaseAdmin();
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const todayStr = tzDate(new Date());

  const [taskRes, areaRes, pendingRes] = await Promise.all([
    sb
      .from("tasks")
      .select("title,status,due_at,completed_at,area_id,urgency,nudge_count,escalation_level,delegated_to")
      .eq("user_id", USER_ID)
      .limit(2000),
    sb.from("entities").select("id,name").eq("user_id", USER_ID).eq("kind", "area"),
    sb.from("confirmations").select("id", { count: "exact", head: true }).eq("user_id", USER_ID).eq("status", "pending"),
  ]);

  const areaById = new Map<string, string>();
  for (const a of (areaRes.data ?? []) as any[]) areaById.set(a.id, a.name);
  const tasks = (taskRes.data ?? []) as any[];

  const OPEN = ["open", "reminded", "escalated", "snoozed"];
  let completedTotal = 0,
    completedWeek = 0,
    completedToday = 0,
    openTotal = 0,
    overdue = 0,
    dueToday = 0,
    delegated = 0,
    followups = 0,
    dropped = 0,
    nudgeSum = 0,
    nudgeN = 0;

  // 14-day completion trend.
  const days: { key: string; label: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    days.push({
      key: tzDate(d),
      label: new Intl.DateTimeFormat("en-GB", { timeZone: USER_TIMEZONE, day: "2-digit" }).format(d),
    });
  }
  const trendMap = new Map<string, number>(days.map((d) => [d.key, 0]));

  const areaAgg = new Map<string, { open: number; done: number; overdue: number; escalated: number }>();
  const bump = (areaName: string, k: "open" | "done" | "overdue" | "escalated") => {
    const e = areaAgg.get(areaName) ?? { open: 0, done: 0, overdue: 0, escalated: 0 };
    e[k] += 1;
    areaAgg.set(areaName, e);
  };

  const delays: { title: string; area: string; days: number }[] = [];
  const delayAreaAgg = new Map<string, { count: number; total: number; max: number }>();
  let delaySum = 0,
    maxDelay = 0;

  for (const t of tasks) {
    const areaName = t.area_id ? areaById.get(t.area_id) ?? "Miscellaneous/Other" : "Miscellaneous/Other";
    if (t.status === "done") {
      completedTotal++;
      if (t.completed_at) {
        const ms = new Date(t.completed_at).getTime();
        if (ms >= weekAgo) completedWeek++;
        if (tzDate(new Date(t.completed_at)) === todayStr) completedToday++;
        const key = tzDate(new Date(t.completed_at));
        if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
      }
      bump(areaName, "done");
    } else if (t.status === "dropped") {
      dropped++;
    } else if (OPEN.includes(t.status)) {
      openTotal++;
      bump(areaName, "open");
      if (t.delegated_to) delegated++;
      if (t.status === "reminded" || t.status === "escalated") followups++;
      if (t.status === "escalated") bump(areaName, "escalated");
      nudgeSum += t.nudge_count ?? 0;
      nudgeN++;
      if (t.due_at) {
        const dd = tzDate(new Date(t.due_at));
        if (dd < todayStr) {
          overdue++;
          bump(areaName, "overdue");
          const late = Math.max(1, dayDiff(dd, todayStr));
          delaySum += late;
          if (late > maxDelay) maxDelay = late;
          delays.push({ title: t.title, area: areaName, days: late });
          const da = delayAreaAgg.get(areaName) ?? { count: 0, total: 0, max: 0 };
          da.count++;
          da.total += late;
          da.max = Math.max(da.max, late);
          delayAreaAgg.set(areaName, da);
        } else if (dd === todayStr) {
          dueToday++;
        }
      }
    }
  }

  const trend: DayBar[] = days.map((d) => ({ label: d.label, count: trendMap.get(d.key) ?? 0 }));
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  const byArea: AreaStat[] = [...areaAgg.entries()]
    .map(([area, e]) => {
      const m = areaMeta(area);
      return {
        area,
        label: m.label,
        color: m.color,
        ...e,
        behind: e.overdue >= 2 || e.escalated >= 1,
      };
    })
    .sort((a, b) => b.open + b.overdue * 2 - (a.open + a.overdue * 2));

  const behind = byArea
    .filter((a) => a.behind)
    .sort((a, b) => b.overdue * 2 + b.escalated - (a.overdue * 2 + a.escalated))
    .slice(0, 4);

  const denom = completedTotal + openTotal + dropped;
  const completionRate = denom ? Math.round((completedTotal / denom) * 100) : 0;
  const avgNudges = nudgeN ? Math.round((nudgeSum / nudgeN) * 10) / 10 : 0;

  const delayedCount = overdue;
  const avgDelayDays = delayedCount ? Math.round((delaySum / delayedCount) * 10) / 10 : 0;
  const maxDelayDays = maxDelay;
  const topDelays = delays
    .sort((a, b) => b.days - a.days)
    .slice(0, 8)
    .map((dl) => {
      const m = areaMeta(dl.area);
      return { title: dl.title, label: m.label, color: m.color, days: dl.days };
    });
  const delaysByArea = [...delayAreaAgg.entries()]
    .map(([area, e]) => {
      const m = areaMeta(area);
      return {
        label: m.label,
        color: m.color,
        count: e.count,
        avgDays: Math.round((e.total / e.count) * 10) / 10,
        maxDays: e.max,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    completedTotal,
    completedWeek,
    completedToday,
    openTotal,
    overdue,
    dueToday,
    delegated,
    followups,
    dropped,
    completionRate,
    avgNudges,
    maxTrend,
    trend,
    byArea,
    behind,
    delayedCount,
    avgDelayDays,
    maxDelayDays,
    topDelays,
    delaysByArea,
    pendingCount: pendingRes.count ?? 0,
  };
}
