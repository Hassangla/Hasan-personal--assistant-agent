import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/llm/anthropic";
import { ANTHROPIC_MODEL, USER_TIMEZONE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/agent/systemPrompt";
import { sendMessage, type InlineKeyboard } from "@/lib/telegram/client";

// The follow-up state machine (spec Part 1.2). Driven by the tick when a task's
// next_nudge_at falls due. The claim_due_tasks() RPC has already locked the row
// and pushed next_nudge_at out tentatively, so this can't double-send.

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  due_at: string | null;
  status: string;
  nudge_count: number | null;
  escalation_level: number | null;
};

const STOP_AFTER_ESCALATIONS = 5;

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

function followupButtons(taskId: string): InlineKeyboard {
  return [
    [
      { text: "✅ Done", callback_data: `fu:${taskId}:done` },
      { text: "😴 Snooze 1d", callback_data: `fu:${taskId}:snooze1d` },
    ],
    [
      { text: "🕒 Snooze to…", callback_data: `fu:${taskId}:snoozeask` },
      { text: "🗑 Drop", callback_data: `fu:${taskId}:drop` },
    ],
  ];
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

type Tone = "gentle" | "firm" | "strong";

function fallbackNudge(task: TaskRow, tone: Tone): string {
  const due = task.due_at ? ` (due ${formatDue(task.due_at)})` : "";
  switch (tone) {
    case "gentle":
      return `Reminder: "${task.title}"${due}. Want me to mark it done?`;
    case "firm":
      return `Still open: "${task.title}"${due}. Done, snooze, or drop?`;
    case "strong":
      return `"${task.title}" has been open a while (nudge #${(task.nudge_count ?? 0) + 1}). Want me to drop it, or are you on it?`;
  }
}

// Compose the nudge with the model, tone scaled by escalation. Uses a direct,
// tool-free completion so composing a reminder can never trigger a side effect.
async function composeNudge(task: TaskRow, tone: Tone): Promise<string> {
  const due = task.due_at ? ` It is due ${formatDue(task.due_at)}.` : "";
  const toneInstruction =
    tone === "gentle"
      ? "Gently remind them. One short line."
      : tone === "firm"
        ? "Firmly nudge them — this is slipping. One or two short lines."
        : "This has been ignored repeatedly. Nudge strongly and ask whether you should drop it. Two short lines max.";
  const prompt = `A tracked task is overdue for follow-up: "${task.title}".${due} Nudge count so far: ${task.nudge_count ?? 0}. ${toneInstruction} Match the user's language. Write ONLY the message body — no preamble.`;

  try {
    const resp = await anthropic().messages.create({
      model: ANTHROPIC_MODEL,
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

// Decide the next state from the current one. Returns the DB patch + the tone.
function transition(task: TaskRow): {
  status: string;
  escalation_level: number;
  next_nudge_at: string | null;
  tone: Tone;
} {
  const status = task.status;

  if (status === "open") {
    return { status: "reminded", escalation_level: 0, next_nudge_at: isoIn(1 * DAYS), tone: "gentle" };
  }

  if (status === "reminded") {
    return { status: "escalated", escalation_level: 1, next_nudge_at: isoIn(12 * HOURS), tone: "firm" };
  }

  // already escalated — keep escalating, then stop
  const nextLevel = (task.escalation_level ?? 1) + 1;
  let next: string | null;
  if (nextLevel >= STOP_AFTER_ESCALATIONS) {
    next = null; // stop auto-nudging; leave flagged on the dashboard
  } else if (nextLevel === 2) {
    next = isoIn(6 * HOURS);
  } else {
    next = isoIn(1 * DAYS);
  }
  return { status: "escalated", escalation_level: nextLevel, next_nudge_at: next, tone: "strong" };
}

// Apply one follow-up step for a claimed task.
export async function runFollowupTransition(task: TaskRow): Promise<void> {
  const sb = supabaseAdmin();
  const t = transition(task);

  // Advance state FIRST (next_nudge_at to its real value) so a concurrent tick
  // can't pick this up again, THEN send. (spec pitfalls #1, #2)
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

  // If we've hit the cap, go quiet — don't send a final spam nudge.
  const reachedCap =
    task.status === "escalated" && t.next_nudge_at === null;
  if (reachedCap) {
    console.info(`[followup] task ${task.id} hit nudge cap; flagged, not sending`);
    return;
  }

  const text = await composeNudge(task, t.tone);
  await sendMessage(text, { buttons: followupButtons(task.id) });
}
