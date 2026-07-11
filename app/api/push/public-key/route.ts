import { NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/push";

// VAPID public key for the browser's pushManager.subscribe. Auth via middleware.
export const runtime = "nodejs";

export async function GET() {
  const { publicKey } = await getVapidKeys();
  return NextResponse.json({ key: publicKey });
}
