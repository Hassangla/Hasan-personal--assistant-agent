import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { connectCarddav, connectUsingCalendarAccount } from "@/lib/people/carddav";

// Connect / disconnect the live iCloud Contacts sync. One-tap reuse of the
// calendar's stored iCloud credential, or explicit Apple ID + app password.
// Auth via middleware; the password is validated, stored encrypted, never
// returned or logged.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (body.disconnect) {
    await supabaseAdmin().from("carddav_accounts").update({ active: false }).eq("user_id", USER_ID);
    return NextResponse.json({ ok: true, disconnected: true });
  }

  try {
    if (body.useCalendarAccount === true) {
      const r = await connectUsingCalendarAccount(USER_ID);
      return NextResponse.json({ ok: true, ...r });
    }
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    if (!username || !password) {
      return NextResponse.json({ error: "Apple ID email and app-specific password required." }, { status: 400 });
    }
    const r = await connectCarddav(USER_ID, username, password);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
