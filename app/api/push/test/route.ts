import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { sendPushToAll } from "@/lib/push";

// Fire a test notification to every registered device. Auth via middleware.
export const runtime = "nodejs";

export async function POST() {
  const sent = await sendPushToAll(USER_ID, {
    title: "Personal Agent 👋",
    body: "Notifications are working on this device.",
    url: "/",
  });
  return NextResponse.json({ ok: true, sent });
}
