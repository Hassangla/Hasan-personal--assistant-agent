import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { remindersTokenValid, pullForReminders } from "@/lib/reminders";

// Platform → Apple Reminders (called by the iOS Shortcut). The URL token IS
// the credential (see middleware) — same model as the calendar feed. Serving
// marks tasks exported; ?dry=1 previews without consuming.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!remindersTokenValid(token)) return new Response("Not found", { status: 404 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const data = await pullForReminders(USER_ID, dry);
  return NextResponse.json(data);
}
