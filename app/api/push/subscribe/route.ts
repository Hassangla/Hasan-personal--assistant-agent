import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { savePushSubscription } from "@/lib/push";

// Register this device for push notifications. Auth via middleware.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "subscription with endpoint + keys required" }, { status: 400 });
  }
  await savePushSubscription(USER_ID, sub, req.headers.get("user-agent") ?? undefined);
  return NextResponse.json({ ok: true });
}
