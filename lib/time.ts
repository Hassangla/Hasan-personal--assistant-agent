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
