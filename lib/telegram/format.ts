import { USER_TIMEZONE } from "@/lib/config";

// Telegram reminder formatting. We send these with parse_mode HTML (more robust
// than Markdown for arbitrary content) — so every dynamic value is escaped.

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fmtDayTime(iso: string): string {
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

function untilText(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 60_000) return "now";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  return h === 1 ? "in 1 hour" : `in ${h} hours`;
}

const TONE_ICON: Record<string, string> = {
  gentle: "⏰",
  firm: "🔔",
  strong: "❗",
  delegated: "👤",
};

// A task follow-up nudge: header (title + area + due/nudge) then the human ask.
export function formatTaskReminder(o: {
  title: string;
  area?: string | null;
  dueIso?: string | null;
  nudgeCount?: number;
  tone: string;
  body: string;
  delegatedTo?: string | null;
}): string {
  const icon = TONE_ICON[o.tone] ?? "⏰";
  const head = o.delegatedTo ? `${icon} <b>Following up</b>` : `${icon} <b>Reminder</b>`;
  const meta: string[] = [];
  if (o.area) meta.push(escapeHtml(o.area));
  if (o.dueIso) meta.push(`due ${escapeHtml(fmtDayTime(o.dueIso))}`);
  else if (o.nudgeCount && o.nudgeCount > 1) meta.push(`nudge #${o.nudgeCount}`);
  if (o.delegatedTo) meta.push(`with ${escapeHtml(o.delegatedTo)}`);
  const metaLine = meta.length ? `\n<i>${meta.join(" · ")}</i>` : "";
  return `${head}\n<b>${escapeHtml(o.title)}</b>${metaLine}\n\n${escapeHtml(o.body)}`;
}

// A pre-meeting reminder.
export function formatMeetingReminder(o: {
  title: string;
  startIso: string;
  endIso?: string | null;
  location?: string | null;
  area?: string | null;
  person?: string | null;
}): string {
  const when = `${fmtTime(o.startIso)}${o.endIso ? `–${fmtTime(o.endIso)}` : ""}`;
  const line2: string[] = [`🕒 ${escapeHtml(when)}`];
  if (o.location) line2.push(`📍 ${escapeHtml(o.location)}`);
  const line3: string[] = [];
  if (o.area) line3.push(escapeHtml(o.area));
  if (o.person) line3.push(`with ${escapeHtml(o.person)}`);
  const line3str = line3.length ? `\n<i>${line3.join(" · ")}</i>` : "";
  return `🗓 <b>Meeting ${escapeHtml(untilText(o.startIso))}</b>\n<b>${escapeHtml(o.title)}</b>\n${line2.join(" · ")}${line3str}`;
}
