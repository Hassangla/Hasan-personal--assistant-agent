import { USER_ID, USER_TIMEZONE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { calendarTokenValid } from "@/lib/calendar";

// Read-only iCalendar subscription feed. The URL token IS the credential, so
// this path is exempt from session auth (see middleware). Subscribe to it in
// Google Calendar ("From URL") or iOS ("Add Subscribed Calendar").
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function icsTime(iso: string): string {
  // → YYYYMMDDTHHMMSSZ (UTC)
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// The task's due wall-clock in the user's tz — 23:59/00:00 means "date-only".
function tzHM(iso: string): { date: string; hm: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date, hm };
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Fold lines to <=75 octets per RFC 5545 (CRLF + leading space).
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let s = line;
  out.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length > 74) {
    out.push(" " + s.slice(0, 74));
    s = s.slice(74);
  }
  if (s.length) out.push(" " + s);
  return out.join("\r\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!calendarTokenValid(token)) {
    return new Response("Not found", { status: 404 });
  }

  const sb = supabaseAdmin();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data: rows }, { data: taskRows }] = await Promise.all([
    sb
      .from("meetings")
      .select("id, title, location, notes, starts_at, ends_at, remind_minutes_before, status, updated_at")
      .eq("user_id", USER_ID)
      .eq("external_source", "agent") // only export agent-created events (don't echo imported ones back)
      .in("status", ["scheduled", "done"])
      .gte("starts_at", since)
      .order("starts_at", { ascending: true })
      .limit(1000),
    // Dated open tasks show as deadline markers on the subscribed calendar.
    sb
      .from("tasks")
      .select("id, title, due_at")
      .eq("user_id", USER_ID)
      .in("status", ["open", "reminded", "escalated", "snoozed"])
      .not("due_at", "is", null)
      .gte("due_at", since)
      .order("due_at", { ascending: true })
      .limit(500),
  ]);

  const now = icsTime(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Personal Agent//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Personal Agent",
    "NAME:Personal Agent",
    "X-WR-TIMEZONE:UTC",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];

  for (const m of (rows ?? []) as any[]) {
    const start = icsTime(m.starts_at);
    const end = icsTime(m.ends_at ?? new Date(new Date(m.starts_at).getTime() + 3600000).toISOString());
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${m.id}@personal-agent`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${esc(m.title)}`);
    if (m.location) lines.push(`LOCATION:${esc(m.location)}`);
    if (m.notes) lines.push(`DESCRIPTION:${esc(m.notes)}`);
    lines.push("STATUS:CONFIRMED");
    const lead = Math.max(0, Number(m.remind_minutes_before ?? 30));
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push("DESCRIPTION:Reminder");
    lines.push(`TRIGGER:-PT${lead}M`);
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  // Task deadlines: timed dues become a 30-min "Due:" block ending at the
  // deadline moment; date-only dues (23:59 local convention) become all-day.
  for (const t of (taskRows ?? []) as any[]) {
    const { date, hm } = tzHM(t.due_at);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:task-${t.id}@personal-agent`);
    lines.push(`DTSTAMP:${now}`);
    if (hm === "23:59" || hm === "00:00") {
      const day = date.replace(/-/g, "");
      const next = new Date(Date.parse(date + "T00:00:00Z") + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
      lines.push(`DTSTART;VALUE=DATE:${day}`);
      lines.push(`DTEND;VALUE=DATE:${next}`);
    } else {
      lines.push(`DTSTART:${icsTime(new Date(new Date(t.due_at).getTime() - 30 * 60000).toISOString())}`);
      lines.push(`DTEND:${icsTime(t.due_at)}`);
    }
    lines.push(`SUMMARY:${esc(`Due: ${t.title}`)}`);
    lines.push("STATUS:CONFIRMED");
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push("DESCRIPTION:Task due");
    lines.push("TRIGGER:-PT60M");
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const body = lines.map(fold).join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="personal-agent.ics"',
      "cache-control": "public, max-age=300",
    },
  });
}
