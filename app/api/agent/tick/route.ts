import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agent/core";
import { runFollowupTransition, type TaskRow } from "@/lib/agent/followup";
import { sendMessage } from "@/lib/telegram/client";

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
  const report = { followups: 0, relationships: 0, jobs: 0, expired_confirmations: 0 };

  // Expire stale pending confirmations so old approvals can't fire (pitfall #5).
  const { data: expired } = await sb.rpc("expire_stale_confirmations", {
    p_user_id: userId,
  });
  report.expired_confirmations = typeof expired === "number" ? expired : 0;

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

async function runScheduledJob(job: ScheduledJob): Promise<void> {
  const sb = supabaseAdmin();
  const cfg = job.config ?? {};

  let hint: string;
  if (job.kind === "checkin") {
    // Pull the (possibly renamed) life areas so the prompt reflects them.
    const { data: areas } = await sb
      .from("entities")
      .select("name")
      .eq("user_id", USER_ID)
      .eq("kind", "area")
      .order("created_at", { ascending: true });
    const names = (areas ?? []).map((a: { name: string }) => a.name).join(", ");
    const label = cfg.label ? `(${cfg.label}) ` : "";
    const base = cfg.prompt ?? "Run a short check-in across the user's life areas.";
    hint = `${label}${base}${names ? ` The user's life areas are: ${names}.` : ""} Send ONE short Telegram message inviting a quick reply; when the user replies you'll log it into check-ins and create any tasks/habits/expenses it implies.`;
  } else if (job.kind === "digest") {
    hint = "Send the user a brief morning digest.";
  } else if (job.kind === "review") {
    hint = "Draft the user's weekly review.";
  } else {
    hint = `Run scheduled job: ${job.kind}.`;
  }

  const text = await runAgent({ trigger: "tick", userId: USER_ID, contextHint: hint });
  if (text) await sendMessage(text);

  // Advance to the next run by the job's cadence (daily by default).
  const everyHours = Number(cfg.every_hours ?? 24);
  await sb
    .from("scheduled_jobs")
    .update({
      next_run_at: new Date(Date.now() + everyHours * 3600000).toISOString(),
    })
    .eq("id", job.id);
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
