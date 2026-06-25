import { USER_TIMEZONE } from "@/lib/config";

// Offset (ms) such that: utcInstant + offset === wall-clock-as-if-UTC.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

// The next UTC instant at which the local wall clock in `tz` reads hh:mm.
// DST-aware (recomputes the offset at the candidate instant).
export function nextLocalTimeUtc(
  hour: number,
  minute = 0,
  tz: string = USER_TIMEZONE,
  from: Date = new Date(),
): Date {
  for (let i = 0; i < 3; i++) {
    const base = new Date(from.getTime() + i * 86400000);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(base);
    const [ys, ms, ds] = ymd.split("-");
    const guess = Date.UTC(Number(ys), Number(ms) - 1, Number(ds), hour, minute, 0);
    let utc = guess - tzOffsetMs(new Date(guess), tz);
    utc = guess - tzOffsetMs(new Date(utc), tz); // refine across a DST edge
    if (utc > from.getTime()) return new Date(utc);
  }
  return new Date(from.getTime() + 86400000);
}

// Local hour (0-23) right now in the timezone.
export function localHour(tz: string = USER_TIMEZONE, at: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(at),
  );
}

// Quiet hours: no proactive Telegram reminders inside this local-time window.
// Defaults to 00:00–07:00; override with QUIET_HOURS_START / QUIET_HOURS_END.
function quietBounds(): { start: number; end: number } {
  const start = Number(process.env.QUIET_HOURS_START ?? 0);
  const end = Number(process.env.QUIET_HOURS_END ?? 7);
  return { start, end };
}

export function inQuietHours(tz: string = USER_TIMEZONE, at: Date = new Date()): boolean {
  const { start, end } = quietBounds();
  if (start === end) return false;
  const h = localHour(tz, at);
  // Handle a window that wraps past midnight (e.g. 22 → 7).
  return start < end ? h >= start && h < end : h >= start || h < end;
}

// The next UTC instant at which quiet hours end (the local QUIET_HOURS_END).
export function quietHoursEndUtc(tz: string = USER_TIMEZONE, from: Date = new Date()): Date {
  const { end } = quietBounds();
  return nextLocalTimeUtc(end, 0, tz, from);
}

// Convert a wall-clock time (interpreted as if in `tz`) to a UTC instant.
function wallTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = guess - tzOffsetMs(new Date(guess), tz);
  utc = guess - tzOffsetMs(new Date(utc), tz); // refine across a DST edge
  return new Date(utc);
}

// Parse a user-supplied date/time to a UTC ISO string. A datetime WITHOUT an
// explicit offset is interpreted in USER_TIMEZONE (NOT the server's UTC), and a
// bare date is treated as end-of-day local. Strings with an offset/Z are kept.
export function toUtcIso(value?: string | null, tz: string = USER_TIMEZONE): string | null {
  if (!value) return null;
  const v = value.trim();
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(v);
  if (!hasOffset) {
    const dt = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (dt) {
      return wallTimeToUtc(+dt[1]!, +dt[2]!, +dt[3]!, +dt[4]!, +dt[5]!, +(dt[6] ?? 0), tz).toISOString();
    }
    const dOnly = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dOnly) {
      return wallTimeToUtc(+dOnly[1]!, +dOnly[2]!, +dOnly[3]!, 23, 59, 0, tz).toISOString();
    }
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
