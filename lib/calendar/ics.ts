import { USER_TIMEZONE } from "@/lib/config";
import { toUtcIso } from "@/lib/time";

// A pragmatic iCalendar (RFC 5545) parser — enough for the published feeds Apple
// Calendar and Google Calendar emit. Handles line folding, common escaping, and
// DTSTART/DTEND in UTC (Z), TZID=<IANA> local, or all-day (VALUE=DATE).
// Recurring events (RRULE) are imported as their base occurrence only.

export type ParsedEvent = {
  uid: string;
  title: string;
  startIso: string;
  endIso: string | null;
  location: string | null;
  description: string | null;
  allDay: boolean;
  cancelled: boolean;
};

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescape(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function valueOf(line: string): string {
  return line.slice(line.indexOf(":") + 1).trim();
}

// Parse a DTSTART/DTEND line → UTC ISO + all-day flag.
function parseDt(line: string): { iso: string | null; allDay: boolean } {
  const colon = line.indexOf(":");
  const params = line.slice(0, colon);
  const value = line.slice(colon + 1).trim();
  const tzid = params.match(/TZID=([^;:]+)/i)?.[1];
  const isDate = /VALUE=DATE\b/i.test(params) || /^\d{8}$/.test(value);

  if (isDate) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return { iso: null, allDay: true };
    return { iso: toUtcIso(`${m[1]}-${m[2]}-${m[3]}T00:00:00`, USER_TIMEZONE), allDay: true };
  }

  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) {
    const t = Date.parse(value);
    return { iso: Number.isNaN(t) ? null : new Date(t).toISOString(), allDay: false };
  }
  const y = m[1]!, mo = m[2]!, d = m[3]!, h = m[4]!, mi = m[5]!, s = m[6] ?? "00", z = m[7];
  if (z === "Z") {
    return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };
  }
  // TZID local time, or floating → interpret in the source tz (fallback to user's).
  const tz = tzid || USER_TIMEZONE;
  return { iso: toUtcIso(`${y}-${mo}-${d}T${h}:${mi}:${s}`, tz), allDay: false };
}

export function parseIcs(text: string): ParsedEvent[] {
  const lines = unfold(text);
  const events: ParsedEvent[] = [];
  let cur: Record<string, any> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.startIso && cur.title) {
        events.push({
          uid: String(cur.uid),
          title: String(cur.title),
          startIso: cur.startIso,
          endIso: cur.endIso ?? null,
          location: cur.location ?? null,
          description: cur.description ?? null,
          allDay: !!cur.allDay,
          cancelled: cur.status === "CANCELLED",
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const key = line.split(/[;:]/, 1)[0]!.toUpperCase();
    switch (key) {
      case "UID":
        cur.uid = valueOf(line);
        break;
      case "SUMMARY":
        cur.title = unescape(valueOf(line));
        break;
      case "LOCATION":
        cur.location = unescape(valueOf(line));
        break;
      case "DESCRIPTION":
        cur.description = unescape(valueOf(line));
        break;
      case "STATUS":
        cur.status = valueOf(line).toUpperCase();
        break;
      case "DTSTART": {
        const r = parseDt(line);
        cur.startIso = r.iso;
        cur.allDay = r.allDay;
        break;
      }
      case "DTEND": {
        cur.endIso = parseDt(line).iso;
        break;
      }
      default:
        break;
    }
  }
  return events;
}
