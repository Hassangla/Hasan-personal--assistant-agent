import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID, USER_TIMEZONE } from "@/lib/config";
import { AREA_META, areaMeta } from "@/lib/areas";
import { calendarFeedPath } from "@/lib/calendar";
import { caldavStatus } from "@/lib/calendar/caldav";

// All reads for the dashboard. Pure data — NEVER calls the model. Run from a
// server component so the service-role client stays server-side.

export type TaskState = { kind: string; color: string; label: string };

export type TodayTask = {
  id: string;
  title: string;
  area: string | null;
  priority: string; // P1..Pn
  state: TaskState;
};
export type AreaCard = {
  slug: string;
  label: string;
  color: string;
  open: number;
  note: string;
};
export type HeartItem = { time: string; label: string; detail: string; color: string };
export type ChaseYou = { id: string; title: string; area: string | null; note: string; noteColor: string };
export type ChaseOther = {
  id: string;
  title: string;
  who: string;
  area: string | null;
  note: string;
  noteColor: string;
};
export type InboxItem = {
  id: string;
  from: string;
  subject: string;
  summary: string | null;
  area: string | null;
  actions: string[];
};
export type PersonRow = { id: string; name: string; role: string; area: string | null };
export type PlanCol = { horizon: string; window: string; items: string[] };
export type MeetingRow = { id: string; title: string; startIso: string; startText: string; area: string | null };

export type DashboardData = {
  metrics: { openPriorities: number; chasingYou: number; chasingOthers: number; awaitingOK: number };
  briefing: { greeting: string; text: string; focus: string[] };
  today: TodayTask[];
  areas: AreaCard[];
  heartbeat: HeartItem[];
  chasingYou: ChaseYou[];
  chasingOthers: ChaseOther[];
  inbox: InboxItem[];
  people: PersonRow[];
  plans: PlanCol[];
  meetings: MeetingRow[];
  calendarFeedPath: string;
  caldavConnected: boolean;
  caldavUsername: string | null;
  pendingCount: number;
};

const ST = {
  due: "#C75F3F",
  reminded: "#BC8638",
  ontime: "#2E8C61",
  waiting: "#3C6FB0",
} as const;

// --- small time helpers (user-tz aware) -------------------------------------
function tzParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date, time };
}
function fmtMeeting(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function ageShort(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "soon";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function dueLabel(due: string | null): TaskState | null {
  if (!due) return null;
  const today = todayStr();
  const { date, time } = tzParts(due);
  if (date < today) return { kind: "due", color: ST.due, label: "Overdue" };
  if (date === today) {
    const label = time === "23:59" || time === "00:00" ? "Due today" : `Due ${time}`;
    return { kind: "due", color: ST.due, label };
  }
  return null;
}

export function taskState(t: any): TaskState {
  const due = dueLabel(t.due_at);
  if (due) return due;
  if (t.status === "reminded" || t.status === "escalated") {
    return { kind: "reminded", color: ST.reminded, label: `Reminded ×${t.nudge_count ?? 1}` };
  }
  return { kind: "ontime", color: ST.ontime, label: "On track" };
}

export async function getDashboardData(): Promise<DashboardData> {
  const sb = supabaseAdmin();
  const OPEN = ["open", "reminded", "escalated", "snoozed"];

  const [areaRes, taskRes, emailRes, peopleRes, planRes, pendingRes, meetingRes] = await Promise.all([
    sb.from("entities").select("id,name").eq("user_id", USER_ID).eq("kind", "area"),
    sb
      .from("tasks")
      .select(
        "id,title,status,due_at,priority_score,urgency,area_id,person_id,delegated_to,nudge_count,last_nudged_at,updated_at",
      )
      .eq("user_id", USER_ID)
      .in("status", OPEN)
      .order("priority_score", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200),
    sb
      .from("emails")
      .select("id,from_name,from_email,subject,summary,classification,area_id,person_id,received_at")
      .eq("user_id", USER_ID)
      .order("received_at", { ascending: false })
      .limit(6),
    sb
      .from("entities")
      .select("id,name,metadata,created_at")
      .eq("user_id", USER_ID)
      .eq("kind", "person")
      .order("created_at", { ascending: false })
      .limit(8),
    sb
      .from("plans")
      .select("id,horizon,title,next_review_at,created_at")
      .eq("user_id", USER_ID)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(30),
    sb
      .from("confirmations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID)
      .eq("status", "pending"),
    sb
      .from("meetings")
      .select("id,title,starts_at,area_id")
      .eq("user_id", USER_ID)
      .eq("status", "scheduled")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(6),
  ]);

  const areaById = new Map<string, string>();
  for (const a of (areaRes.data ?? []) as any[]) areaById.set(a.id, a.name);
  const areaNameOf = (id: string | null): string | null => (id ? areaById.get(id) ?? null : null);

  const tasks = (taskRes.data ?? []) as any[];
  const personArea = new Map<string, string>();
  for (const t of tasks) {
    if (t.person_id && t.area_id && !personArea.has(t.person_id)) {
      const n = areaNameOf(t.area_id);
      if (n) personArea.set(t.person_id, n);
    }
  }
  for (const e of (emailRes.data ?? []) as any[]) {
    if (e.person_id && e.area_id && !personArea.has(e.person_id)) {
      const n = areaNameOf(e.area_id);
      if (n) personArea.set(e.person_id, n);
    }
  }

  // --- partitions ---
  const own = tasks.filter((t) => !t.delegated_to);
  const delegated = tasks.filter((t) => t.delegated_to);

  // Today: the user's own open priorities.
  const today: TodayTask[] = own.slice(0, 8).map((t, i) => ({
    id: t.id,
    title: t.title,
    area: areaNameOf(t.area_id),
    priority: `P${i + 1}`,
    state: taskState(t),
  }));

  // Metrics.
  const chasingYouTasks = own.filter((t) => t.status === "reminded" || t.status === "escalated");
  const metrics = {
    openPriorities: own.length,
    chasingYou: chasingYouTasks.length,
    chasingOthers: delegated.length,
    awaitingOK: pendingRes.count ?? 0,
  };

  // Areas: open counts + a note per canonical area.
  const byArea = new Map<string, { open: number; follow: number; delegated: number }>();
  for (const t of tasks) {
    const name = areaNameOf(t.area_id);
    const canonical = areaMeta(name).canonical;
    const e = byArea.get(canonical) ?? { open: 0, follow: 0, delegated: 0 };
    e.open += 1;
    if (t.delegated_to) e.delegated += 1;
    else if (t.status === "reminded" || t.status === "escalated") e.follow += 1;
    byArea.set(canonical, e);
  }
  const areas: AreaCard[] = AREA_META.map((m) => {
    const e = byArea.get(m.canonical) ?? { open: 0, follow: 0, delegated: 0 };
    let note = "clear";
    if (e.delegated > 0) note = `${e.delegated} delegated`;
    else if (e.follow > 0) note = `${e.follow} follow-up${e.follow > 1 ? "s" : ""}`;
    else if (e.open > 0) note = "on track";
    return { slug: m.slug, label: m.label, color: m.color, open: e.open, note };
  });

  // Following up.
  const chasingYou: ChaseYou[] = chasingYouTasks
    .sort((a, b) => (b.last_nudged_at ?? b.updated_at ?? "").localeCompare(a.last_nudged_at ?? a.updated_at ?? ""))
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      title: t.title,
      area: areaNameOf(t.area_id),
      note: `Reminded ×${t.nudge_count ?? 1} · ${ageShort(t.last_nudged_at ?? t.updated_at)}`,
      noteColor: ST.reminded,
    }));

  const chasingOthers: ChaseOther[] = delegated.slice(0, 5).map((t) => {
    const due = dueLabel(t.due_at);
    return {
      id: t.id,
      title: t.title,
      who: t.delegated_to as string,
      area: areaNameOf(t.area_id),
      note: due ? due.label : `Chasing · ${ageShort(t.last_nudged_at ?? t.updated_at)}`,
      noteColor: due ? ST.due : ST.waiting,
    };
  });

  // Inbox.
  const inbox: InboxItem[] = ((emailRes.data ?? []) as any[]).map((e) => ({
    id: e.id,
    from: e.from_name || e.from_email || "unknown",
    subject: e.subject ?? "(no subject)",
    summary: e.summary ?? null,
    area: areaNameOf(e.area_id) ?? (e.classification?.area as string) ?? null,
    actions: ["Make task", "Draft reply"],
  }));

  // People.
  const people: PersonRow[] = ((peopleRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    name: p.name,
    role: (p.metadata?.role as string) || (p.metadata?.title as string) || "Contact",
    area: personArea.get(p.id) ?? (p.metadata?.area as string) ?? null,
  }));

  // Plans grouped into the three horizons (always render all three columns).
  const WINDOWS: Record<"short" | "medium" | "long", string> = {
    short: "This week",
    medium: "This month",
    long: "This quarter",
  };
  const plans: PlanCol[] = (["short", "medium", "long"] as const).map((h) => ({
    horizon: h,
    window: WINDOWS[h],
    items: ((planRes.data ?? []) as any[]).filter((p) => p.horizon === h).map((p) => p.title),
  }));

  // Heartbeat: the daily rhythm, grounded in real counts + upcoming due items.
  const followCount = chasingYouTasks.length + delegated.length;
  const upcoming = own
    .filter((t) => {
      const d = dueLabel(t.due_at);
      return d && d.kind === "due";
    })
    .slice(0, 2)
    .map((t) => {
      const { time } = tzParts(t.due_at);
      return {
        time: time === "23:59" || time === "00:00" ? "TODAY" : time,
        label: `Reminder · ${t.title}`,
        detail: "Repeats until done",
        color: "#B7AE9D",
      } as HeartItem;
    });
  const heartbeat: HeartItem[] = [
    { time: "06:00", label: "Morning briefing", detail: "Your day + suggested order", color: "#2E8C61" },
    {
      time: "NOW",
      label: "Watching",
      detail: `${own.length} open · ${followCount} in follow-up`,
      color: "#C75F3F",
    },
    ...upcoming,
    { time: "21:00", label: "Evening schedule check", detail: "Tomorrow's plan", color: "#B7AE9D" },
  ];

  const meetings: MeetingRow[] = ((meetingRes.data ?? []) as any[]).map((m) => ({
    id: m.id,
    title: m.title,
    startIso: m.starts_at,
    startText: fmtMeeting(m.starts_at),
    area: areaNameOf(m.area_id),
  }));

  const briefing = composeBriefing({ today, metrics, areas, chasingOthers });
  const cal = await caldavStatus(USER_ID);

  return {
    metrics,
    briefing,
    today,
    areas,
    heartbeat,
    chasingYou,
    chasingOthers,
    inbox,
    people,
    plans,
    meetings,
    calendarFeedPath: calendarFeedPath(),
    caldavConnected: cal.connected,
    caldavUsername: cal.username ?? null,
    pendingCount: metrics.awaitingOK,
  };
}

// --- data-driven briefing in the agent's first-person voice -----------------
function greetingFor(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: USER_TIMEZONE, hour: "2-digit", hour12: false }).format(new Date()),
  );
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}

function composeBriefing(d: {
  today: TodayTask[];
  metrics: DashboardData["metrics"];
  areas: AreaCard[];
  chasingOthers: ChaseOther[];
}): DashboardData["briefing"] {
  const { openPriorities, chasingYou } = d.metrics;
  const parts: string[] = [];

  if (openPriorities === 0) {
    parts.push("You're all clear — nothing open right now. A good moment to think ahead, or just breathe.");
  } else {
    const topArea = [...d.areas].filter((a) => a.open > 0).sort((a, b) => b.open - a.open)[0];
    const areaClause = topArea && topArea.open >= 2 ? `, most of them ${topArea.label}` : "";
    parts.push(
      `You've got ${openPriorities} ${openPriorities === 1 ? "priority" : "priorities"} today${areaClause}.`,
    );

    const due = d.today.find((t) => t.state.kind === "due");
    if (due) parts.push(`${due.title} is the one with a clock on it.`);

    if (chasingYou > 0) parts.push(`I'm chasing ${chasingYou} of them for you.`);

    const del = d.chasingOthers[0];
    if (del) parts.push(`I'm still waiting on ${del.who} for ${del.title.toLowerCase()}.`);

    const first = d.today[0];
    if (first) parts.push(`If it were me, I'd start with ${first.title.toLowerCase()}.`);
  }

  const focus = d.today.slice(0, 3).map((t) => t.title);
  return { greeting: greetingFor(), text: parts.join(" "), focus };
}
