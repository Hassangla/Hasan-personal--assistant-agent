import { USER_TIMEZONE } from "@/lib/config";
import { toUtcIso } from "@/lib/time";
import { resolveIcsTz } from "@/lib/calendar/tz";

// A pragmatic iCalendar (RFC 5545) parser — enough for the published feeds
// Apple, Google, Outlook/Exchange, and Proton emit. Handles line folding,
// common escaping, and DTSTART/DTEND in UTC (Z), TZID local (IANA or Windows
// names like "Eastern Standard Time", mapped via resolveIcsTz), or all-day
// (VALUE=DATE). Unknown zones fall back to the user's timezone, and a
// malformed event is skipped rather than aborting the import.
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

// Split "NAME;PARAM=x:VALUE" at the first colon OUTSIDE double quotes — Outlook
// quotes TZIDs that themselves contain a colon: TZID="(UTC-05:00) Eastern…".
function splitProp(line: string): { params: string; value: string } {
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ":" && !inQ) return { params: line.slice(0, i), value: line.slice(i + 1).trim() };
  }
  return { params: line, value: "" };
}

// Parse a DTSTART/DTEND line → UTC ISO + all-day flag.
function parseDt(line: string): { iso: string | null; allDay: boolean } {
  const { params, value } = splitProp(line);
  const tzid = params.match(/TZID=("[^"]*"|[^;:]+)/i)?.[1];
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
  // TZID local time, or floating. Windows/Exchange names ("Eastern Standard
  // Time") resolve to IANA; unresolvable zones fall back to the user's tz.
  const tz = resolveIcsTz(tzid) ?? USER_TIMEZONE;
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
        // A single unparseable event must never abort the whole feed — the
        // missing startIso just drops this event at END:VEVENT.
        try {
          const r = parseDt(line);
          cur.startIso = r.iso;
          cur.allDay = r.allDay;
        } catch {
          cur.startIso = null;
        }
        break;
      }
      case "DTEND": {
        try {
          cur.endIso = parseDt(line).iso;
        } catch {
          cur.endIso = null;
        }
        break;
      }
      default:
        break;
    }
  }
  return events;
}
