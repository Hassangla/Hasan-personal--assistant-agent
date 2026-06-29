import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Resolve a duplicate task group: keep one, drop the rest (status → dropped).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const dropIds: string[] = Array.isArray(body.drop_ids) ? body.drop_ids.filter((x: unknown) => typeof x === "string") : [];
  if (!dropIds.length) return NextResponse.json({ error: "drop_ids required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("tasks")
    .update({ status: "dropped", next_nudge_at: null })
    .in("id", dropIds)
    .eq("user_id", USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, removed: dropIds.length });
}
