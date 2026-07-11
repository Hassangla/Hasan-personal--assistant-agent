import { NextResponse } from "next/server";
import { USER_ID, USER_TIMEZONE, userToday } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agent/core";
import { runFollowupTransition, type TaskRow } from "@/lib/agent/followup";
import { sendMessage } from "@/lib/telegram/client";
import { formatMeetingReminder } from "@/lib/telegram/format";
import { areaMeta } from "@/lib/areas";
import { importDueSources } from "@/lib/calendar/import";
import { syncCaldavAccounts } from "@/lib/calendar/caldav";
import { nextLocalTimeUtc, inQuietHours, toUtcIso } from "@/lib/time";
import type { Complexity } from "@/lib/llm/models";

export const runtime = "nodejs";
export const maxDuration = 60;

// The proactive heartbeat. Vercel cron hits this (GET, with the CRON_SECRET
// bearer). Keeps work per tick bounded; backlog is handled by the next tick.
async function handle(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const userId = USER_ID;
  const report = { followups: 0, meetings: 0, imported_meetings: 0, relationships: 0, jobs: 0, expired_confirmations: 0 };

  // Expire stale pending confirmations so old approvals can't fire (pitfall #5).
  const { data: expired } = await sb.rpc("expire_stale_confirmations", {
    p_user_id: userId,
  });
  report.expired_confirmations = typeof expired === "number" ? expired : 0;

  // IMPORTED CALENDARS — pull external (Apple/Google) feeds in. Runs even during
  // quiet hours: it never sends Telegram, it only refreshes the calendar.
  try {
    const imp = await importDueSources(userId);
    report.imported_meetings = imp.imported;
  } catch (e) {
    console.error("[tick] calendar import failed:", e);
  }
  try {
    const cd = await syncCaldavAccounts(userId);
    report.imported_meetings += cd.imported;
  } catch (e) {
    console.error("[tick] caldav sync failed:", e);
  }

  // QUIET HOURS — no proactive reminders overnight; everything due is held and
  // delivered once the local clock passes QUIET_HOURS_END (default 07:00).
  if (inQuietHours()) {
    return NextResponse.json({ ok: true, quiet: true, ...report });
  }

  // 1. DUE FOLLOW-UPS — claim-then-act under a row lock.
  const { data: tasks, error: tErr } = await sb.rpc("claim_due_tasks", {
    p_user_id: userId,
    p_limit: 25,
  });
  if (tErr) console.error("[tick] claim_due_tasks:", tErr.message);
  for (const task of (tasks ?? []) as TaskRow[]) {
    try {
      await runFollowupTransition(task);
      report.followups++;
    } catch (err) {
      console.error("[tick] followup failed:", err);
    }
  }

  // 1b. MEETING REMINDERS — claim due, not-yet-sent reminders for upcoming
  // meetings (set reminded=true atomically so we never double-send).
  const nowIso = new Date().toISOString();
  const { data: dueMeetings } = await sb
    .from("meetings")
    .update({ reminded: true })
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .eq("reminded", false)
    .lte("next_reminder_at", nowIso)
    .gt("starts_at", nowIso)
    .select("id, title, starts_at, ends_at, location, area_id, person_id");
  for (const m of (dueMeetings ?? []) as any[]) {
    try {
      const areaName = m.area_id
        ? (await sb.from("entities").select("name").eq("id", m.area_id).maybeSingle()).data?.name ?? null
        : null;
      const personName = m.person_id
        ? (await sb.from("entities").select("name").eq("id", m.person_id).maybeSingle()).data?.name ?? null
        : null;
      const text = formatMeetingReminder({
        title: m.title,
        startIso: m.starts_at,
        endIso: m.ends_at,
        location: m.location,
        area: areaName ? areaMeta(areaName).label : null,
        person: personName,
      });
      await sendMessage(text, { parseMode: "HTML" });
      // Mirror to web push (installed PWA on iPhone/iPad/desktop).
      try {
        const { sendPushToAll } = await import("@/lib/push");
        const t = new Intl.DateTimeFormat("en-GB", {
          timeZone: process.env.USER_TIMEZONE || "UTC",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(m.starts_at));
        await sendPushToAll(userId, {
          title: `Meeting soon: ${m.title}`,
          body: `${t}${m.location ? ` · ${m.location}` : ""}`,
          url: "/calendar",
        });
      } catch (e) {
        console.error("[tick] meeting push failed:", e);
      }
      report.meetings++;
    } catch (err) {
      console.error("[tick] meeting reminder failed:", err);
    }
  }

  // 2. STALE RELATIONSHIPS — offer to reconnect.
  const { data: interactions } = await sb.rpc("claim_due_interactions", {
    p_user_id: userId,
    p_limit: 10,
  });
  for (const it of (interactions ?? []) as { person_id: string | null }[]) {
    try {
      let name = "someone you know";
      if (it.person_id) {
        const { data: p } = await sb
          .from("entities")
          .select("name")
          .eq("id", it.person_id)
          .maybeSingle();
        if (p?.name) name = p.name;
      }
      await sendMessage(
        `You haven't reconnected with ${name} in a while — want me to draft a message?`,
      );
      report.relationships++;
    } catch (err) {
      console.error("[tick] relationship nudge failed:", err);
    }
  }

  // 3. SCHEDULED JOBS — checkin / digest / review (seeded in Parts 2–3).
  const { data: jobs } = await sb.rpc("claim_due_jobs", {
    p_user_id: userId,
    p_limit: 10,
  });
  for (const job of (jobs ?? []) as ScheduledJob[]) {
    try {
      await runScheduledJob(job);
      report.jobs++;
    } catch (err) {
      console.error("[tick] scheduled job failed:", err);
    }
  }

  return NextResponse.json({ ok: true, ...report });
}

type ScheduledJob = {
  id: string;
  kind: string | null;
  config: Record<string, any> | null;
};

// Today's active tasks → a morning briefing prompt (day + suggested priorities
// + clarify area-less tasks + ask about schedule).
async function buildMorningHint(): Promise<string> {
  const sb = supabaseAdmin();
  const today = userToday();
  const endToday = toUtcIso(`${today}T23:59:00`) ?? new Date(Date.now() + 18 * 3600000).toISOString();
  const [taskRes, areaRes, meetRes] = await Promise.all([
    sb
      .from("tasks")
      .select("title, due_at, area_id, urgency, status, nudge_count, delegated_to")
      .eq("user_id", USER_ID)
      .in("status", ["open", "reminded", "escalated", "snoozed"])
      .order("priority_score", { ascending: false })
      .limit(25),
    sb.from("entities").select("id,name").eq("user_id", USER_ID).eq("kind", "area"),
    sb
      .from("meetings")
      .select("title, starts_at, location")
      .eq("user_id", USER_ID)
      .eq("status", "scheduled")
      .gte("starts_at", new Date().toISOString())
      .lte("starts_at", endToday)
      .order("starts_at", { ascending: true })
      .limit(10),
  ]);

  const areaById = new Map<string, string>();
  for (const a of (areaRes.data ?? []) as any[]) areaById.set(a.id, a.name);
  const tzDate = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: USER_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const tzTime = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: USER_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

  const rows = (taskRes.data ?? []) as any[];
  const lines = rows
    .map((t) => {
      const flags: string[] = [];
      if (t.due_at) {
        const d = tzDate(t.due_at);
        if (d < today) flags.push("OVERDUE");
        else if (d === today) flags.push("DUE TODAY");
      }
      if (t.urgency === "high") flags.push("urgent");
      if (t.status === "reminded" || t.status === "escalated") flags.push(`nudged ×${t.nudge_count ?? 1}`);
      if (t.delegated_to) flags.push(`delegated to ${t.delegated_to}`);
      const area = t.area_id ? areaById.get(t.area_id) ?? "—" : "no area";
      return `- ${flags.length ? `[${flags.join(", ")}] ` : ""}${t.title} — ${area}`;
    })
    .join("\n");
  const meetings = ((meetRes.data ?? []) as any[])
    .map((m) => `- ${tzTime(m.starts_at)} ${m.title}${m.location ? ` @ ${m.location}` : ""}`)
    .join("\n");
  const ambiguous = rows.filter((t) => !t.area_id).map((t) => t.title);

  return [
    `MORNING BRIEF. Compose a clear, scannable daily summary (present all times in the user's timezone). This is the daily digest — a short STRUCTURED message with line breaks is expected, not a single sentence.`,
    `Open tasks (already in priority order, with flags):\n${lines || "(none)"}`,
    meetings ? `Today's meetings:\n${meetings}` : `No meetings scheduled today.`,
    `Write the brief in this shape, keeping every line short:\n• One opening line naming the single most important thing to do first.\n• "⏰ Due / overdue" — the dated or overdue items.\n• "🔴 Urgent" — anything urgent (omit if none).\n• "🗓 Meetings" — today's meetings with times (omit if none).\n• A one-line by-area tally (e.g. "World Bank 4 · SJD 1 · Personal 2").\nEnd by asking what they want to tackle first.`,
    ambiguous.length ? `Also ask them to set an area for: ${ambiguous.join("; ")}.` : ``,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function buildHourlyHint(): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data: tasks } = await sb
    .from("tasks")
    .select("title, due_at")
    .eq("user_id", USER_ID)
    .in("status", ["open", "reminded", "escalated"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(10);
  const rows = (tasks ?? []) as any[];
  if (rows.length === 0) return null;
  const lines = rows.map((t) => `- ${t.title}${t.due_at ? ` (due ${t.due_at} UTC)` : ""}`).join("\n");
  return `Hourly review (present times in the user's timezone). Active tasks:\n${lines}\n\nSend a very short review: what's still open and anything due soon. One or two lines.`;
}

async function buildPlanReviewHint(): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data: plans } = await sb
    .from("plans")
    .select("id, horizon, title")
    .eq("user_id", USER_ID)
    .eq("status", "active")
    .not("next_review_at", "is", null)
    .lte("next_review_at", new Date().toISOString())
    .limit(5);
  const rows = (plans ?? []) as any[];
  if (rows.length === 0) return null;
  const lines = rows.map((p) => `- [${p.horizon}] ${p.title}`).join("\n");
  return `These plans are due for review:\n${lines}\n\nWalk the user through reviewing them (progress, blockers, next steps), then call update_plan to advance each plan's next_review.`;
}

async function runScheduledJob(job: ScheduledJob): Promise<void> {
  const sb = supabaseAdmin();
  const cfg = job.config ?? {};
  const kind = job.kind ?? "";

  let hint: string | null;
  let complexity: Complexity = cfg.complexity === "complex" ? "complex" : "simple";

  if (kind === "morning_brief") {
    hint = await buildMorningHint();
    complexity = "complex";
  } else if (kind === "evening_schedule") {
    hint =
      "Evening: in one short message, ask the user about tomorrow's schedule and anything to carry over. Invite a quick reply.";
    complexity = "complex";
  } else if (kind === "hourly_review") {
    hint = await buildHourlyHint();
    complexity = "simple";
  } else if (kind === "plan_review") {
    hint = await buildPlanReviewHint();
    complexity = "complex";
  } else {
    hint = `Run scheduled job: ${kind}.`;
  }

  if (hint) {
    const text = await runAgent({
      trigger: "tick",
      userId: USER_ID,
      contextHint: hint,
      complexity,
    });
    if (text) await sendMessage(text);
  }

  // Advance: timezone-anchored local time, or a fixed interval.
  let nextRun: string;
  if (cfg.at_local) {
    const [hs, ms] = String(cfg.at_local).split(":");
    nextRun = nextLocalTimeUtc(Number(hs), Number(ms ?? 0)).toISOString();
  } else {
    const everyHours = Number(cfg.every_hours ?? 24);
    nextRun = new Date(Date.now() + everyHours * 3600000).toISOString();
  }
  await sb.from("scheduled_jobs").update({ next_run_at: nextRun }).eq("id", job.id);
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
