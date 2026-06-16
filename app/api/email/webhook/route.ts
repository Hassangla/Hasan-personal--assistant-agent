import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { processInboundEmail } from "@/lib/email/process";

// AgentMail inbound webhook. Svix-signed; verified against AGENTMAIL_WEBHOOK_SECRET
// over the RAW body. Email content is untrusted and only ever summarized.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const raw = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let evt: any;
  try {
    evt = new Webhook(secret).verify(raw, headers);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  try {
    if (evt?.event_type === "message.received" && evt.message) {
      await processInboundEmail(evt.message);
    }
  } catch (err: any) {
    console.error("[email] process failed:", err?.message ?? err);
  }
  return NextResponse.json({ ok: true });
}
