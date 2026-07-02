import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID, USER_TIMEZONE } from "@/lib/config";
import { calendarFeedPath } from "@/lib/calendar";
import { caldavAccounts, type CaldavAccount } from "@/lib/calendar/caldav";
import { listCalendarSources, type CalSource } from "@/lib/calendar/import";

export type CalMeeting = {
  id: string;
  title: string;
  startText: string;
  area: string | null;
  location: string | null;
};
export type CalendarData = {
  upcoming: CalMeeting[];
  past: CalMeeting[];
  calendarFeedPath: string;
  caldavAccounts: CaldavAccount[];
  sources: CalSource[];
  pendingCount: number;
};

function fmt(iso: string): string {
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

export async function getCalendarData(): Promise<CalendarData> {
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const [areaRes, upRes, pastRes, pendingRes] = await Promise.all([
    sb.from("entities").select("id,name").eq("user_id", USER_ID).eq("kind", "area"),
    sb
      .from("meetings")
      .select("id,title,starts_at,location,area_id")
      .eq("user_id", USER_ID)
      .eq("status", "scheduled")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(50),
    sb
      .from("meetings")
      .select("id,title,starts_at,location,area_id")
      .eq("user_id", USER_ID)
      .in("status", ["scheduled", "done"])
      .lt("starts_at", nowIso)
      .order("starts_at", { ascending: false })
      .limit(15),
    sb.from("confirmations").select("id", { count: "exact", head: true }).eq("user_id", USER_ID).eq("status", "pending"),
  ]);

  const areaById = new Map<string, string>();
  for (const a of (areaRes.data ?? []) as any[]) areaById.set(a.id, a.name);
  const map = (rows: any[]): CalMeeting[] =>
    rows.map((m) => ({
      id: m.id,
      title: m.title,
      startText: fmt(m.starts_at),
      area: m.area_id ? areaById.get(m.area_id) ?? null : null,
      location: m.location ?? null,
    }));

  const [accounts, sources] = await Promise.all([caldavAccounts(USER_ID), listCalendarSources(USER_ID)]);

  return {
    upcoming: map((upRes.data ?? []) as any[]),
    past: map((pastRes.data ?? []) as any[]),
    calendarFeedPath: calendarFeedPath(),
    caldavAccounts: accounts,
    sources,
    pendingCount: pendingRes.count ?? 0,
  };
}
