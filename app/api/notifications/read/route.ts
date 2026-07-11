import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Mark one notification ({id}) or everything ({all:true}) as read.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  if (body.all === true) {
    await sb.from("notifications").update({ read_at: now }).eq("user_id", USER_ID).is("read_at", null);
    return NextResponse.json({ ok: true });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id or all:true required" }, { status: 400 });
  await sb.from("notifications").update({ read_at: now }).eq("id", id).eq("user_id", USER_ID);
  return NextResponse.json({ ok: true });
}
