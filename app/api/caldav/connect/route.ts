import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { connectCaldav, disconnectCaldav } from "@/lib/calendar/caldav";

// Connect (or disconnect) a CalDAV account. Supports multiple accounts across
// providers that allow app-password CalDAV (iCloud, Fastmail, Yahoo, or a custom
// server). Auth is enforced by middleware; the password is validated against the
// server, stored encrypted, and never returned or logged.
export const runtime = "nodejs";
export const maxDuration = 60;

const ICLOUD = "https://caldav.icloud.com";
const SERVERS: Record<string, string> = {
  icloud: ICLOUD,
  fastmail: "https://caldav.fastmail.com",
  yahoo: "https://caldav.calendar.yahoo.com",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (body.disconnect) {
    const accountId = typeof body.accountId === "string" ? body.accountId : undefined;
    await disconnectCaldav(USER_ID, accountId);
    return NextResponse.json({ ok: true, disconnected: true });
  }

  const username =
    typeof body.username === "string"
      ? body.username.trim()
      : typeof body.appleId === "string"
        ? body.appleId.trim()
        : "";
  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!username || !password) {
    return NextResponse.json({ error: "Email and app-specific password are required." }, { status: 400 });
  }

  const provider = typeof body.provider === "string" ? body.provider : "icloud";
  let server = SERVERS[provider] ?? "";
  if (provider === "custom") {
    server = typeof body.server === "string" ? body.server.trim() : "";
    if (!/^https:\/\//i.test(server)) {
      return NextResponse.json({ error: "Enter a CalDAV server URL starting with https://" }, { status: 400 });
    }
  }
  if (!server) server = ICLOUD;

  try {
    const r = await connectCaldav(USER_ID, server, username, password);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
