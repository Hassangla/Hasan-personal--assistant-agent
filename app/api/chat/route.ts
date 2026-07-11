import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { runAgent } from "@/lib/agent/core";

// The in-app chat — same brain, same shared history as Telegram and capture.
// Auth via middleware.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const reply = await runAgent({
    trigger: "inbound",
    userId: USER_ID,
    inboundText: text,
    channel: "chat",
  });
  return NextResponse.json({ ok: true, reply });
}
