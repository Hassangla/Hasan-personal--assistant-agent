import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { remindersTokenValid, pushFromReminders } from "@/lib/reminders";

// Apple Reminders → platform (called by the iOS Shortcut, once per reminder).
// Creates a real task (same follow-up logic as chat) or completes the matching
// task for a finished "pa:" reminder. Token in the URL is the credential.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!remindersTokenValid(token)) return new Response("Not found", { status: 404 });
  const body = await req.json().catch(() => ({}));
  const result = await pushFromReminders(USER_ID, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
