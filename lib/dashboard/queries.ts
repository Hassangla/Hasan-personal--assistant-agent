import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID, userToday, userMonthStartISO } from "@/lib/config";

// All reads for the dashboard. Pure data — NEVER calls the model. Run from a
// server component so the service-role client stays server-side.

export type DashTask = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  priority_score: number;
  urgency: string | null;
};
export type DashFollowup = {
  id: string;
  title: string;
  status: string;
  next_nudge_at: string | null;
  nudge_count: number;
  escalation_level: number;
};
export type LedgerItem = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
  due_at: string | null;
  reason: string | null;
  delegated_to: string | null;
};
export type DashboardData = {
  today: DashTask[];
  followups: DashFollowup[];
  ledger: LedgerItem[];
  areas: { id: string; name: string; checkin: string | null }[];
  habits: { name: string; streak: number; today: boolean }[];
  expenses: {
    totals: { currency: string; total: number }[];
    recent: {
      amount: number;
      currency: string;
      category: string | null;
      note: string | null;
      spent_at: string;
    }[];
  };
  people: { id: string; name: string; summary: string | null; next_touch_at: string | null }[];
  plans: { id: string; horizon: string; title: string; status: string; next_review_at: string | null }[];
  mail: { id: string; from: string; subject: string; summary: string | null; area: string | null; received_at: string | null }[];
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getDashboardData(): Promise<DashboardData> {
  const sb = supabaseAdmin();
  const today = userToday();
  const monthStart = userMonthStartISO();
  const soonIso = new Date(Date.now() + 3 * 86400000).toISOString();
  const logsSince = ymd(new Date(Date.now() - 40 * 86400000));

  const [
    todayRes,
    followRes,
    ledgerRes,
    reasonRes,
    areaRes,
    checkinRes,
    habitRes,
    logRes,
    monthExpRes,
    recentExpRes,
    peopleRes,
    plansRes,
    mailRes,
  ] = await Promise.all([
    sb
      .from("tasks")
      .select("id,title,status,due_at,priority_score,urgency")
      .eq("user_id", USER_ID)
      .in("status", ["open", "reminded", "escalated", "snoozed"])
      .order("priority_score", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(8),
    sb
      .from("tasks")
      .select("id,title,status,next_nudge_at,nudge_count,escalation_level")
      .eq("user_id", USER_ID)
      .in("status", ["reminded", "escalated"])
      .order("next_nudge_at", { ascending: true })
      .limit(8),
    // Recent tasks across ALL statuses — the done / not-done ledger.
    sb
      .from("tasks")
      .select("id,title,status,completed_at,due_at,updated_at,delegated_to")
      .eq("user_id", USER_ID)
      .order("updated_at", { ascending: false })
      .limit(14),
    // Outcome reasons live in the audit log (tool-call payloads).
    sb
      .from("audit_log")
      .select("resource_id,action,payload,created_at")
      .eq("user_id", USER_ID)
      .eq("resource_type", "task")
      .in("action", ["complete_task", "drop_task", "snooze_task"])
      .order("created_at", { ascending: false })
      .limit(60),
    sb
      .from("entities")
      .select("id,name")
      .eq("user_id", USER_ID)
      .eq("kind", "area")
      .order("created_at", { ascending: true }),
    sb
      .from("checkins")
      .select("area_id,response,created_at")
      .eq("user_id", USER_ID)
      .eq("checkin_date", today)
      .order("created_at", { ascending: false }),
    sb
      .from("habits")
      .select("id,name")
      .eq("user_id", USER_ID)
      .eq("active", true)
      .order("name", { ascending: true }),
    sb
      .from("habit_logs")
      .select("habit_id,log_date,count")
      .eq("user_id", USER_ID)
      .gte("log_date", logsSince),
    sb
      .from("expenses")
      .select("amount,currency")
      .eq("user_id", USER_ID)
      .gte("spent_at", monthStart),
    sb
      .from("expenses")
      .select("amount,currency,category,note,spent_at")
      .eq("user_id", USER_ID)
      .order("spent_at", { ascending: false })
      .limit(6),
    sb
      .from("interactions")
      .select("id,summary,next_touch_at,person:entities!interactions_person_id_fkey(name)")
      .eq("user_id", USER_ID)
      .not("next_touch_at", "is", null)
      .lte("next_touch_at", soonIso)
      .order("next_touch_at", { ascending: true })
      .limit(8),
    sb
      .from("plans")
      .select("id, horizon, title, status, next_review_at")
      .eq("user_id", USER_ID)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(12),
    sb
      .from("emails")
      .select("id, from_name, from_email, subject, summary, classification, received_at")
      .eq("user_id", USER_ID)
      .order("received_at", { ascending: false })
      .limit(8),
  ]);

  // Latest reason per task from the audit log.
  const reasonByTask = new Map<string, string>();
  for (const r of (reasonRes.data ?? []) as any[]) {
    const id = r.resource_id as string | null;
    const reason = r.payload?.reason as string | undefined;
    if (id && reason && !reasonByTask.has(id)) reasonByTask.set(id, reason);
  }
  const ledger = ((ledgerRes.data ?? []) as any[]).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    completed_at: t.completed_at,
    due_at: t.due_at,
    reason: reasonByTask.get(t.id) ?? null,
    delegated_to: t.delegated_to ?? null,
  }));

  // Areas + latest check-in today.
  const checkinByArea = new Map<string, string>();
  for (const c of (checkinRes.data ?? []) as any[]) {
    if (c.area_id && !checkinByArea.has(c.area_id)) {
      checkinByArea.set(c.area_id, c.response);
    }
  }
  const areas = ((areaRes.data ?? []) as any[]).map((a) => ({
    id: a.id,
    name: a.name,
    checkin: checkinByArea.get(a.id) ?? null,
  }));

  // Habit streaks (consecutive days with a positive log, ending today/yesterday).
  const logsByHabit = new Map<string, Set<string>>();
  for (const l of (logRes.data ?? []) as any[]) {
    if ((l.count ?? 0) <= 0) continue;
    if (!logsByHabit.has(l.habit_id)) logsByHabit.set(l.habit_id, new Set());
    logsByHabit.get(l.habit_id)!.add(l.log_date);
  }
  const habits = ((habitRes.data ?? []) as any[]).map((h) => {
    const set = logsByHabit.get(h.id) ?? new Set<string>();
    const todayLogged = set.has(today);
    let streak = 0;
    let cursor = new Date(today + "T00:00:00Z");
    if (!set.has(ymd(cursor))) cursor = new Date(cursor.getTime() - 86400000);
    while (set.has(ymd(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - 86400000);
    }
    return { name: h.name, streak, today: todayLogged };
  });

  // Expense totals by currency (month to date).
  const totalsMap = new Map<string, number>();
  for (const e of (monthExpRes.data ?? []) as any[]) {
    const cur = e.currency ?? "USD";
    totalsMap.set(cur, (totalsMap.get(cur) ?? 0) + Number(e.amount ?? 0));
  }
  const totals = [...totalsMap.entries()].map(([currency, total]) => ({
    currency,
    total,
  }));

  const people = ((peopleRes.data ?? []) as any[]).map((p) => {
    const name =
      (Array.isArray(p.person) ? p.person[0]?.name : p.person?.name) ?? "Someone";
    return { id: p.id, name, summary: p.summary, next_touch_at: p.next_touch_at };
  });

  return {
    today: (todayRes.data ?? []) as DashTask[],
    followups: (followRes.data ?? []) as DashFollowup[],
    ledger,
    areas,
    habits,
    expenses: { totals, recent: (recentExpRes.data ?? []) as any },
    people,
    plans: (plansRes.data ?? []) as any,
    mail: ((mailRes.data ?? []) as any[]).map((m) => ({
      id: m.id,
      from: m.from_name || m.from_email || "unknown",
      subject: m.subject ?? "(no subject)",
      summary: m.summary ?? null,
      area: (m.classification as any)?.area ?? null,
      received_at: m.received_at ?? null,
    })),
  };
}
