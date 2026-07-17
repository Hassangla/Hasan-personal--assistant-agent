import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { runAgent } from "@/lib/agent/core";
import { transcribeAudio, transcriptionAvailable } from "@/lib/llm/transcribe";

// Voice message in the in-app chat: the recorded clip is transcribed, then run
// through the SAME agent as a typed message (shared history). Returns both the
// transcript (to show as the user's bubble) and the reply.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!transcriptionAvailable()) {
    return NextResponse.json({ error: "Voice notes aren't set up on the server." }, { status: 503 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "That voice note is too long (25 MB max)." }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const type = (file.type || "audio/webm").toLowerCase();
  const ext = type.includes("mp4") || type.includes("m4a") || type.includes("aac")
    ? "m4a"
    : type.includes("ogg") || type.includes("opus")
      ? "ogg"
      : type.includes("wav")
        ? "wav"
        : type.includes("mpeg") || type.includes("mp3")
          ? "mp3"
          : "webm";

  const transcript = (await transcribeAudio(buf, `voice.${ext}`))?.trim();
  if (!transcript) {
    return NextResponse.json({ error: "Couldn't make out that recording — try again or type it." }, { status: 422 });
  }

  const reply = await runAgent({ trigger: "inbound", userId: USER_ID, inboundText: transcript, channel: "chat" });
  return NextResponse.json({ ok: true, transcript, reply });
}
