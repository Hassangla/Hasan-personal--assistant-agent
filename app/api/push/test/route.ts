import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { sendPushToAll } from "@/lib/push";
import { logNotification } from "@/lib/notify";

// Fire a test notification to every registered device. Auth via middleware.
export const runtime = "nodejs";

export async function POST() {
  const sent = await sendPushToAll(USER_ID, {
    title: "Personal Agent 👋",
    body: "Notifications are working on this device.",
    url: "/",
  });
  await logNotification({
    userId: USER_ID,
    kind: "test",
    title: "Test notification",
    body: `Delivered to ${sent} device(s).`,
    url: "/calendar",
    channels: "push",
  });
  return NextResponse.json({ ok: true, sent });
}
