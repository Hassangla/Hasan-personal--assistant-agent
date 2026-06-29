import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Merge duplicate people: repoint their tasks/emails/interactions to the kept
// contact, then delete the duplicate entities.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const keepId = typeof body.keep_id === "string" ? body.keep_id : "";
  const dropIds: string[] = Array.isArray(body.drop_ids) ? body.drop_ids.filter((x: unknown) => typeof x === "string") : [];
  if (!keepId || !dropIds.length) return NextResponse.json({ error: "keep_id and drop_ids required" }, { status: 400 });

  const sb = supabaseAdmin();
  for (const table of ["tasks", "emails", "interactions"]) {
    await sb.from(table).update({ person_id: keepId }).in("person_id", dropIds).eq("user_id", USER_ID);
  }
  const { error } = await sb.from("entities").delete().in("id", dropIds).eq("user_id", USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, merged: dropIds.length });
}
