import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Idempotent seed for Part 2: five life-area entities + the daily check-in jobs.
// Auth is enforced by middleware (session cookie or x-api-secret). Safe to call
// repeatedly — it only inserts what's missing.
export const runtime = "nodejs";

const DEFAULT_AREAS = [
  "Work/Procurement",
  "World Bank/WBL",
  "Thesis",
  "Health",
  "Personal Growth",
];

// Next occurrence of a given UTC hour.
function nextRunAtUtc(hourUtc: number): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0),
  );
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export async function POST() {
  const sb = supabaseAdmin();
  const userId = USER_ID;

  // 1. Life areas (idempotent by name; renameable later).
  const areasCreated: string[] = [];
  for (const name of DEFAULT_AREAS) {
    const { data: existing } = await sb
      .from("entities")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "area")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existing) continue;
    const { error } = await sb
      .from("entities")
      .insert({ user_id: userId, kind: "area", name });
    if (!error) areasCreated.push(name);
  }

  // 2. Daily check-in scheduled_jobs (idempotent by config.label).
  const { data: jobs } = await sb
    .from("scheduled_jobs")
    .select("config")
    .eq("user_id", userId)
    .eq("kind", "checkin");
  const haveLabels = new Set(
    ((jobs ?? []) as { config: { label?: string } | null }[])
      .map((j) => j.config?.label)
      .filter(Boolean),
  );

  const JOB_DEFS = [
    {
      label: "morning",
      hourUtc: 6,
      prompt:
        "Morning check-in: ask for today's single intent or top priority in each life area.",
    },
    {
      label: "evening",
      hourUtc: 18,
      prompt:
        "Evening check-in: ask how today went across the life areas — a quick win and anything that slipped.",
    },
  ];
  const jobsCreated: string[] = [];
  for (const j of JOB_DEFS) {
    if (haveLabels.has(j.label)) continue;
    const { error } = await sb.from("scheduled_jobs").insert({
      user_id: userId,
      kind: "checkin",
      active: true,
      next_run_at: nextRunAtUtc(j.hourUtc),
      config: { label: j.label, prompt: j.prompt, every_hours: 24 },
    });
    if (!error) jobsCreated.push(j.label);
  }

  return NextResponse.json({
    ok: true,
    areas_created: areasCreated,
    jobs_created: jobsCreated,
  });
}
