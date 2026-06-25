import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/llm/anthropic";
import { MODEL_FAST } from "@/lib/llm/models";
import { USER_TIMEZONE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/agent/systemPrompt";
import { sendMessage } from "@/lib/telegram/client";
import { followupKeyboard } from "@/lib/telegram/keyboards";
import { formatTaskReminder } from "@/lib/telegram/format";
import { areaMeta } from "@/lib/areas";

// The follow-up state machine. Driven by the tick when a task's next_nudge_at
// falls due (the claim_due_tasks RPC has locked the row and pushed it out, so
// this can't double-send).
//
// Three modes:
//   - delegated  → steady daily check-in ("has <person> finished?"), never stops.
//   - deadline   → hourly reminders until done, never stops.
//   - default    → gentle → firm → strong → stop after ~5 escalations.

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  due_at: string | null;
  status: string;
  nudge_count: number | null;
  escalation_level: number | null;
  delegated_to: string | null;
  area_id: string | null;
};

// Short label for the area, for the reminder header.
async function resolveAreaLabel(areaId: string | null): Promise<string | null> {
  if (!areaId) return null;
  const { data } = await supabaseAdmin().from("entities").select("name").eq("id", areaId).maybeSingle();
  const name = (data?.name as string) ?? null;
  return name ? areaMeta(name).label : null;
}

const STOP_AFTER_ESCALATIONS = 5;
const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function formatDue(due: string | null): string {
  if (!due) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: USER_TIMEZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(due));
  } catch {
    return due;
  }
}

type Tone = "gentle" | "firm" | "strong" | "delegated";

// Body line only — the structured header already shows the title/due/area.
function fallbackNudge(task: TaskRow, tone: Tone): string {
  switch (tone) {
    case "delegated":
      return `Has ${task.delegated_to ?? "they"} finished it yet?`;
    case "gentle":
      return `Did you get to it? If not, what's the plan?`;
    case "firm":
      return `Done, or should we postpone — what's blocking?`;
    case "strong":
      return `Is it done, postponed, or should I drop it? What's the reason?`;
  }
}

// Compose the nudge with the FAST model (a short reminder is simple work).
async function composeNudge(task: TaskRow, tone: Tone): Promise<string> {
  const due = task.due_at ? ` It is due ${formatDue(task.due_at)}.` : "";
  let prompt: string;
  if (tone === "delegated") {
    prompt = `A task is delegated to ${task.delegated_to}: "${task.title}".${due} Ask the user whether ${task.delegated_to} has FULLY completed it yet — they'll answer with a button. One short line.`;
  } else {
    const toneInstruction =
      tone === "gentle"
        ? "Gently remind them. One short line."
        : tone === "firm"
          ? "Firmly nudge them — this is slipping. One or two short lines."
          : "This has been ignored repeatedly. Nudge strongly. Two short lines max.";
    prompt = `A tracked task is overdue for follow-up: "${task.title}".${due} Nudge count so far: ${task.nudge_count ?? 0}. ${toneInstruction} Ask plainly whether it's done; if not, ask the reason and whether to postpone (and to when).`;
  }
  prompt +=
    " Match the user's language. The task title and time are already shown above your line — do NOT repeat them. Write ONLY the short nudge/question (one line), no preamble.";

  try {
    const resp = await anthropic().messages.create({
      model: MODEL_FAST,
      max_tokens: 300,
      system: buildSystemPrompt({ proactive: true }),
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || fallbackNudge(task, tone);
  } catch (err) {
    console.error("[followup] compose failed, using fallback:", err);
    return fallbackNudge(task, tone);
  }
}

function transition(task: TaskRow): {
  status: string;
  escalation_level: number;
  next_nudge_at: string | null;
  tone: Tone;
} {
  // Delegated: keep checking with the user ~daily until they confirm done.
  if (task.delegated_to) {
    return {
      status: task.status === "open" ? "reminded" : task.status,
      escalation_level: task.escalation_level ?? 0,
      next_nudge_at: isoIn(1 * DAYS),
      tone: "delegated",
    };
  }

  // Hard deadline time: remind hourly until done — never auto-stop.
  if (task.due_at) {
    const becomingEscalated = task.status !== "open";
    return {
      status: becomingEscalated ? "escalated" : "reminded",
      escalation_level: (task.escalation_level ?? 0) + 1,
      next_nudge_at: isoIn(1 * HOURS),
      tone: becomingEscalated ? "strong" : "firm",
    };
  }

  // Default gentle → firm → strong → stop.
  if (task.status === "open") {
    return { status: "reminded", escalation_level: 0, next_nudge_at: isoIn(1 * DAYS), tone: "gentle" };
  }
  if (task.status === "reminded") {
    return { status: "escalated", escalation_level: 1, next_nudge_at: isoIn(12 * HOURS), tone: "firm" };
  }
  const nextLevel = (task.escalation_level ?? 1) + 1;
  let next: string | null;
  if (nextLevel >= STOP_AFTER_ESCALATIONS) next = null;
  else if (nextLevel === 2) next = isoIn(6 * HOURS);
  else next = isoIn(1 * DAYS);
  return { status: "escalated", escalation_level: nextLevel, next_nudge_at: next, tone: "strong" };
}

export async function runFollowupTransition(task: TaskRow): Promise<void> {
  const sb = supabaseAdmin();
  const t = transition(task);

  // Advance state FIRST so a concurrent tick can't re-grab it, THEN send.
  const { error } = await sb
    .from("tasks")
    .update({
      status: t.status,
      escalation_level: t.escalation_level,
      nudge_count: (task.nudge_count ?? 0) + 1,
      last_nudged_at: new Date().toISOString(),
      next_nudge_at: t.next_nudge_at,
    })
    .eq("id", task.id)
    .eq("user_id", task.user_id);
  if (error) {
    console.error("[followup] state update failed:", error.message);
    return;
  }

  // Default mode can hit the cap and go quiet (flagged on the dashboard).
  if (!task.delegated_to && !task.due_at && task.status === "escalated" && t.next_nudge_at === null) {
    console.info(`[followup] task ${task.id} hit nudge cap; flagged, not sending`);
    return;
  }

  const body = await composeNudge(task, t.tone);
  const areaLabel = await resolveAreaLabel(task.area_id);
  const text = formatTaskReminder({
    title: task.title,
    area: areaLabel,
    dueIso: task.due_at,
    nudgeCount: (task.nudge_count ?? 0) + 1,
    tone: t.tone,
    body,
    delegatedTo: task.delegated_to,
  });
  await sendMessage(text, {
    parseMode: "HTML",
    buttons: followupKeyboard(task.id, Boolean(task.delegated_to)),
  });
}
