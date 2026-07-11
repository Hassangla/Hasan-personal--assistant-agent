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

// Signed distance to a deadline: "in 3 hours" / "overdue by 2 days".
function dueDistance(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const m = Math.round(abs / 60_000);
  const h = Math.round(m / 60);
  const d = Math.round(h / 24);
  const span = m < 60 ? `${m} min` : h < 36 ? (h === 1 ? "1 hour" : `${h} hours`) : `${d} days`;
  if (ms >= -60_000 && ms <= 60_000) return { text: "now", overdue: ms < 0 };
  return ms > 0 ? { text: `in ${span}`, overdue: false } : { text: `overdue by ${span}`, overdue: true };
}

const TONE_ICON: Record<string, string> = {
  gentle: "⏰",
  firm: "🔔",
  strong: "❗",
  delegated: "👤",
};

// A task follow-up nudge. Scannable card: what → when (with a live-feeling
// countdown / overdue flag) → progress → one short human ask.
export function formatTaskReminder(o: {
  title: string;
  area?: string | null;
  dueIso?: string | null;
  nudgeCount?: number;
  tone: string;
  body: string;
  delegatedTo?: string | null;
  checklist?: { done: number; total: number } | null;
}): string {
  const icon = TONE_ICON[o.tone] ?? "⏰";
  const kind = o.delegatedTo ? "Following up" : "Reminder";
  const head = `${icon} <b>${kind}</b>${o.area ? ` · <i>${escapeHtml(o.area)}</i>` : ""}`;

  const lines: string[] = [head, `📌 <b>${escapeHtml(o.title)}</b>`];

  if (o.dueIso) {
    const dist = dueDistance(o.dueIso);
    const flag = dist.overdue ? "❗" : "⏳";
    const distText = dist.overdue ? `<b>${escapeHtml(dist.text)}</b>` : escapeHtml(dist.text);
    lines.push(`${flag} ${escapeHtml(fmtDayTime(o.dueIso))} — ${distText}`);
  }
  if (o.delegatedTo) lines.push(`👤 with ${escapeHtml(o.delegatedTo)}`);
  if (o.checklist && o.checklist.total > 0) {
    lines.push(`☑ ${o.checklist.done}/${o.checklist.total} steps done`);
  }
  if (!o.dueIso && o.nudgeCount && o.nudgeCount > 1) {
    lines.push(`<i>nudge #${o.nudgeCount}</i>`);
  }

  return `${lines.join("\n")}\n\n${escapeHtml(o.body)}`;
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
