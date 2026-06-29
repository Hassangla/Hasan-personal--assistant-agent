import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { connectCaldav, disconnectCaldav } from "@/lib/calendar/caldav";

// Connect (or disconnect) a CalDAV account (iCloud). Auth is enforced by
// middleware (session cookie). The app password is validated against the server
// and stored encrypted; it is never returned or logged.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (body.disconnect) {
    await disconnectCaldav(USER_ID);
    return NextResponse.json({ ok: true, disconnected: true });
  }

  const appleId = typeof body.appleId === "string" ? body.appleId.trim() : "";
  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!appleId || !password) {
    return NextResponse.json({ error: "Apple ID and app-specific password are required." }, { status: 400 });
  }

  try {
    const r = await connectCaldav(USER_ID, "https://caldav.icloud.com", appleId, password);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
