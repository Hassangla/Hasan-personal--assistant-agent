import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { remindersTokenValid, requeueReminders } from "@/lib/reminders";

// Re-queue all open platform-born tasks for the next Shortcut pull — recovery
// after a misconfigured Shortcut consumed the queue without creating the
// reminders. Token in the URL is the credential.
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!remindersTokenValid(token)) return new Response("Not found", { status: 404 });
  const requeued = await requeueReminders(USER_ID);
  return NextResponse.json({ ok: true, requeued });
}
