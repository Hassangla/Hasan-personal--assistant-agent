import { USER_TIMEZONE } from "@/lib/config";
import { toUtcIso } from "@/lib/time";
import { resolveIcsTz } from "@/lib/calendar/tz";

// A pragmatic iCalendar (RFC 5545) parser — enough for the published feeds
// Apple, Google, Outlook/Exchange, and Proton emit. Handles line folding,
// common escaping, and DTSTART/DTEND in UTC (Z), TZID local (IANA or Windows
// names like "Eastern Standard Time", mapped via resolveIcsTz), or all-day
// (VALUE=DATE). Unknown zones fall back to the user's timezone, and a
// malformed event is skipped rather than aborting the import.
//
// Recurring events (RRULE) are expanded into their upcoming occurrences —
// DAILY / WEEKLY / MONTHLY / YEARLY with INTERVAL, COUNT, UNTIL, BYDAY
// (weekly) and BYMONTHDAY (monthly) — inside a bounded window (default
// -7d..+90d), honoring EXDATE exclusions and RECURRENCE-ID overrides.
// Recurrence is computed on the event's LOCAL wall clock, so a 15:00
// Eastern weekly meeting stays 15:00 across DST changes.

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

type DtParts = {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  tz: string; // resolved IANA zone (or user tz fallback)
  utc: boolean;
  isDate: boolean;
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

// Parse one date/date-time value (with its property params) into components.
function parseDtParts(params: string, value: string): DtParts | null {
  const tzid = params.match(/TZID=("[^"]*"|[^;:]+)/i)?.[1];
  const isDate = /VALUE=DATE\b/i.test(params) || /^\d{8}$/.test(value);

  if (isDate) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return { y: +m[1]!, mo: +m[2]!, d: +m[3]!, h: 0, mi: 0, s: 0, tz: USER_TIMEZONE, utc: false, isDate: true };
  }

  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  return {
    y: +m[1]!,
    mo: +m[2]!,
    d: +m[3]!,
    h: +m[4]!,
    mi: +m[5]!,
    s: +(m[6] ?? "0"),
    tz: resolveIcsTz(tzid) ?? USER_TIMEZONE,
    utc: m[7] === "Z",
    isDate: false,
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Components (a wall-clock time in parts.tz, or UTC) → UTC ISO instant.
function partsToIso(p: DtParts): string | null {
  if (p.utc) return new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)).toISOString();
  return toUtcIso(`${p.y}-${pad2(p.mo)}-${pad2(p.d)}T${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)}`, p.tz);
}

// Parse a DTSTART/DTEND line → UTC ISO + all-day flag (+ raw parts for RRULE).
function parseDt(line: string): { iso: string | null; allDay: boolean; parts: DtParts | null } {
  const { params, value } = splitProp(line);
  const parts = parseDtParts(params, value);
  if (!parts) {
    const t = Date.parse(value);
    return { iso: Number.isNaN(t) ? null : new Date(t).toISOString(), allDay: false, parts: null };
  }
  return { iso: partsToIso(parts), allDay: parts.isDate, parts };
}

// EXDATE lines (each may hold several comma-separated values) → set of UTC ISOs.
function parseExdates(lines: string[]): Set<string> {
  const out = new Set<string>();
  for (const line of lines) {
    const { params, value } = splitProp(line);
    for (const v of value.split(",")) {
      const p = parseDtParts(params, v.trim());
      const iso = p ? partsToIso(p) : null;
      if (iso) out.add(iso);
    }
  }
  return out;
}

// Stable per-occurrence UID suffix.
const occSuffix = (iso: string) => "#" + iso.replace(/[-:]/g, "").replace(".000", "");

const DAY_MS = 86400000;
const DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Expand an RRULE into occurrence UTC ISOs (chronological, base included),
// bounded by [fromMs, toMs]. Wall-clock recurrence in the event's zone.
function expandRrule(base: DtParts, baseIso: string, rule: string, fromMs: number, toMs: number): string[] {
  const R: Record<string, string> = {};
  for (const part of rule.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) R[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).toUpperCase();
  }
  const freq = R.FREQ;
  if (!freq) return [];
  const interval = Math.max(1, Number(R.INTERVAL ?? 1) || 1);
  const count = R.COUNT ? Number(R.COUNT) : null;

  let untilMs: number | null = null;
  if (R.UNTIL) {
    const um = R.UNTIL.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
    if (um) {
      untilMs = um[4]
        ? Date.UTC(+um[1]!, +um[2]! - 1, +um[3]!, +um[4]!, +um[5]!, +(um[6] ?? "0"))
        : Date.UTC(+um[1]!, +um[2]! - 1, +um[3]!, 23, 59, 59);
    }
  }

  // Pure calendar-day arithmetic in UTC space (no DST wobble); the wall time
  // (base.h/mi/s) is re-applied per occurrence via partsToIso.
  const baseDayMs = Date.UTC(base.y, base.mo - 1, base.d);
  const mkIso = (dayMs: number): string | null => {
    const dt = new Date(dayMs);
    return partsToIso({ ...base, y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
  };

  const out: string[] = [];
  let n = 0; // occurrences consumed since the series start (for COUNT)
  const MAX_OUT = 240;
  const push = (iso: string | null): "stop" | "cont" => {
    if (!iso) return "cont";
    const t = Date.parse(iso);
    n++;
    if (count != null && n > count) return "stop";
    if (untilMs != null && t > untilMs) return "stop";
    if (t > toMs) return "stop";
    if (t >= fromMs) out.push(iso);
    return "cont";
  };

  if (freq === "DAILY") {
    let k = 0;
    // Fast-forward old series straight to the window (COUNT needs full replay).
    if (count == null && fromMs > Date.parse(baseIso)) {
      k = Math.max(0, Math.floor((fromMs - Date.parse(baseIso)) / (interval * DAY_MS)) - 1);
    }
    for (let i = 0; i < 5000 && out.length < MAX_OUT; i++, k++) {
      if (push(mkIso(baseDayMs + k * interval * DAY_MS)) === "stop") break;
    }
  } else if (freq === "WEEKLY") {
    const byday = R.BYDAY
      ? R.BYDAY.split(",")
          .map((s) => DOW.indexOf(s.trim().slice(-2)))
          .filter((i) => i >= 0)
      : [new Date(baseDayMs).getUTCDay()];
    let scan = baseDayMs;
    if (count == null && fromMs - 8 * DAY_MS > baseDayMs) {
      const weeksSkip = Math.floor((fromMs - baseDayMs) / (interval * 7 * DAY_MS));
      scan = Math.max(baseDayMs, baseDayMs + (weeksSkip - 1) * interval * 7 * DAY_MS);
    }
    for (let dayMs = scan, i = 0; i < 5000 && out.length < MAX_OUT; dayMs += DAY_MS, i++) {
      if (dayMs < baseDayMs) continue;
      const weekIdx = Math.floor((dayMs - baseDayMs) / (7 * DAY_MS));
      if (weekIdx % interval !== 0) continue;
      if (!byday.includes(new Date(dayMs).getUTCDay())) continue;
      if (push(mkIso(dayMs)) === "stop") break;
    }
  } else if (freq === "MONTHLY") {
    const day0 = R.BYMONTHDAY ? Number(R.BYMONTHDAY.split(",")[0]) || base.d : base.d;
    for (let k = 0, i = 0; i < 1500 && out.length < MAX_OUT; k += interval, i++) {
      const y2 = base.y + Math.floor((base.mo - 1 + k) / 12);
      const m2 = (base.mo - 1 + k) % 12;
      const dayMs = Date.UTC(y2, m2, day0);
      if (new Date(dayMs).getUTCMonth() !== m2) continue; // day doesn't exist (e.g. 31st)
      if (push(mkIso(dayMs)) === "stop") break;
    }
  } else if (freq === "YEARLY") {
    for (let k = 0, i = 0; i < 300 && out.length < MAX_OUT; k += interval, i++) {
      const dayMs = Date.UTC(base.y + k, base.mo - 1, base.d);
      if (new Date(dayMs).getUTCMonth() !== base.mo - 1) continue; // Feb 29 in a non-leap year
      if (push(mkIso(dayMs)) === "stop") break;
    }
  }
  return out;
}

type RawEvent = {
  uid: string;
  title: string;
  startIso: string;
  startParts: DtParts | null;
  endIso: string | null;
  location: string | null;
  description: string | null;
  allDay: boolean;
  cancelled: boolean;
  rrule: string | null;
  exdateLines: string[];
  recurrenceIdIso: string | null;
};

export function parseIcs(
  text: string,
  opts?: { expandFromMs?: number; expandToMs?: number },
): ParsedEvent[] {
  const expandFrom = opts?.expandFromMs ?? Date.now() - 7 * DAY_MS;
  const expandTo = opts?.expandToMs ?? Date.now() + 90 * DAY_MS;

  const lines = unfold(text);
  const raw: RawEvent[] = [];
  let cur: Record<string, any> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { exdateLines: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.startIso && cur.title) {
        raw.push({
          uid: String(cur.uid),
          title: String(cur.title),
          startIso: cur.startIso,
          startParts: cur.startParts ?? null,
          endIso: cur.endIso ?? null,
          location: cur.location ?? null,
          description: cur.description ?? null,
          allDay: !!cur.allDay,
          cancelled: cur.status === "CANCELLED",
          rrule: cur.rrule ?? null,
          exdateLines: cur.exdateLines,
          recurrenceIdIso: cur.recurrenceIdIso ?? null,
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
      case "RRULE":
        cur.rrule = valueOf(line);
        break;
      case "EXDATE":
        cur.exdateLines.push(line);
        break;
      case "RECURRENCE-ID": {
        try {
          cur.recurrenceIdIso = parseDt(line).iso;
        } catch {
          cur.recurrenceIdIso = null;
        }
        break;
      }
      case "DTSTART": {
        // A single unparseable event must never abort the whole feed — the
        // missing startIso just drops this event at END:VEVENT.
        try {
          const r = parseDt(line);
          cur.startIso = r.iso;
          cur.allDay = r.allDay;
          cur.startParts = r.parts;
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

  // Modified instances (RECURRENCE-ID) replace their expanded occurrence.
  const overrides = new Map<string, Set<string>>();
  for (const e of raw) {
    if (!e.recurrenceIdIso) continue;
    const set = overrides.get(e.uid) ?? new Set<string>();
    set.add(e.recurrenceIdIso);
    overrides.set(e.uid, set);
  }

  const events: ParsedEvent[] = [];
  for (const e of raw) {
    // Outlook "cancels" meetings by renaming them ("Canceled: Weekly sync")
    // while often leaving STATUS untouched in the published feed.
    const cancelled = e.cancelled || /^cancell?ed:\s/i.test(e.title);
    const common = {
      title: e.title,
      location: e.location,
      description: e.description,
      allDay: e.allDay,
      cancelled,
    };

    if (e.recurrenceIdIso) {
      // A single modified/cancelled occurrence of a series.
      events.push({ uid: e.uid + occSuffix(e.recurrenceIdIso), startIso: e.startIso, endIso: e.endIso, ...common });
      continue;
    }

    // The base occurrence keeps the plain UID (stable with prior imports).
    events.push({ uid: e.uid, startIso: e.startIso, endIso: e.endIso, ...common });

    if (e.rrule && e.startParts) {
      try {
        const exdates = parseExdates(e.exdateLines);
        const skip = overrides.get(e.uid);
        const durMs = e.endIso ? Date.parse(e.endIso) - Date.parse(e.startIso) : null;
        for (const occIso of expandRrule(e.startParts, e.startIso, e.rrule, expandFrom, expandTo)) {
          if (occIso === e.startIso) continue; // base already emitted
          if (exdates.has(occIso) || skip?.has(occIso)) continue;
          events.push({
            uid: e.uid + occSuffix(occIso),
            startIso: occIso,
            endIso: durMs != null && durMs >= 0 ? new Date(Date.parse(occIso) + durMs).toISOString() : null,
            ...common,
          });
        }
      } catch {
        // Expansion is best-effort; the base occurrence is already in.
      }
    }
  }
  return events;
}
