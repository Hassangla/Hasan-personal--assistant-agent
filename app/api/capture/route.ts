import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { runAgent } from "@/lib/agent/core";

// Desk capture: the dashboard's floating box POSTs here. Same pipeline as the
// Telegram webhook. Auth is enforced by middleware (session cookie or
// x-api-secret header).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  const reply = await runAgent({
    trigger: "inbound",
    userId: USER_ID,
    inboundText: text,
    contextHint: body.source ? `Capture source: ${body.source}` : undefined,
  });
  return NextResponse.json({ ok: true, reply });
}
