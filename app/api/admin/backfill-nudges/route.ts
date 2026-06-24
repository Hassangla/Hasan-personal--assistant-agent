import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// One-shot maintenance: give every active task that has no next_nudge_at a
// staggered one (highest priority first, 90 min apart) so previously-orphaned
// undated tasks re-enter the follow-up cycle without a nudge-storm.
// Auth enforced by middleware (session cookie or x-api-secret).
export const runtime = "nodejs";

export async function POST() {
  const sb = supabaseAdmin();
  const { data: tasks } = await sb
    .from("tasks")
    .select("id, title")
    .eq("user_id", USER_ID)
    .in("status", ["open", "reminded", "escalated", "snoozed"])
    .is("next_nudge_at", null)
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: true });

  const rows = (tasks ?? []) as { id: string; title: string }[];
  const titles: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const next = new Date(Date.now() + (i + 1) * 90 * 60000).toISOString();
    await sb.from("tasks").update({ next_nudge_at: next }).eq("id", rows[i]!.id);
    titles.push(rows[i]!.title);
  }
  return NextResponse.json({ ok: true, backfilled: titles.length, tasks: titles });
}
