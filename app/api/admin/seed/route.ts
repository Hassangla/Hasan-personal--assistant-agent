import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { AREAS } from "@/lib/areas";
import { nextLocalTimeUtc } from "@/lib/time";

// Idempotent (re)seed: force exactly the seven canonical areas, and replace the
// scheduled rituals with the timezone-anchored set. Auth enforced by middleware
// (session cookie or x-api-secret).
export const runtime = "nodejs";

export async function POST() {
  const sb = supabaseAdmin();
  const userId = USER_ID;

  // 1. Ensure exactly the seven areas exist.
  const { data: existing } = await sb
    .from("entities")
    .select("id, name")
    .eq("user_id", userId)
    .eq("kind", "area");
  const byName = new Map(
    ((existing ?? []) as { id: string; name: string }[]).map((e) => [
      e.name.toLowerCase(),
      e,
    ]),
  );
  const keepIds = new Set<string>();
  const areasCreated: string[] = [];
  for (const name of AREAS) {
    const found = byName.get(name.toLowerCase());
    if (found) {
      keepIds.add(found.id);
    } else {
      const { data } = await sb
        .from("entities")
        .insert({ user_id: userId, kind: "area", name })
        .select("id")
        .single();
      if (data) {
        keepIds.add(data.id);
        areasCreated.push(name);
      }
    }
  }

  // 2. Remove any area NOT in the seven (null references first to satisfy FKs).
  const extras = ((existing ?? []) as { id: string; name: string }[]).filter(
    (e) => !keepIds.has(e.id),
  );
  const areasRemoved: string[] = [];
  for (const e of extras) {
    await sb.from("tasks").update({ area_id: null }).eq("user_id", userId).eq("area_id", e.id);
    await sb.from("habits").update({ area_id: null }).eq("user_id", userId).eq("area_id", e.id);
    await sb.from("checkins").update({ area_id: null }).eq("user_id", userId).eq("area_id", e.id);
    await sb.from("entities").delete().eq("id", e.id);
    areasRemoved.push(e.name);
  }

  // 3. Replace the scheduled rituals (all times in USER_TIMEZONE).
  await sb.from("scheduled_jobs").delete().eq("user_id", userId);
  const nowIso = new Date().toISOString();
  const jobs = [
    { kind: "morning_brief", next_run_at: nextLocalTimeUtc(6, 0).toISOString(), config: { at_local: "06:00", complexity: "complex" } },
    { kind: "evening_schedule", next_run_at: nextLocalTimeUtc(21, 0).toISOString(), config: { at_local: "21:00", complexity: "complex" } },
    { kind: "hourly_review", next_run_at: nowIso, config: { every_hours: 1, complexity: "simple" } },
    { kind: "plan_review", next_run_at: nextLocalTimeUtc(8, 0).toISOString(), config: { at_local: "08:00", complexity: "complex" } },
  ];
  for (const j of jobs) {
    await sb.from("scheduled_jobs").insert({
      user_id: userId,
      kind: j.kind,
      active: true,
      next_run_at: j.next_run_at,
      config: j.config,
    });
  }

  return NextResponse.json({
    ok: true,
    areas_created: areasCreated,
    areas_removed: areasRemoved,
    areas_now: AREAS,
    jobs: jobs.map((j) => ({ kind: j.kind, next_run_at: j.next_run_at })),
  });
}
