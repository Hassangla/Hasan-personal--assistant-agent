import "server-only";
import OpenAI, { toFile } from "openai";
import { optionalEnv, OPENAI_TRANSCRIBE_MODEL } from "@/lib/config";

export function transcriptionAvailable(): boolean {
  return Boolean(optionalEnv("OPENAI_API_KEY"));
}

// Transcribes a voice note. Returns null if no provider is configured (the
// Anthropic-only path) — callers should fall back to telling the user.
export async function transcribeAudio(
  buf: Buffer,
  filename = "voice.ogg",
): Promise<string | null> {
  const key = optionalEnv("OPENAI_API_KEY");
  if (!key) return null;
  const client = new OpenAI({ apiKey: key });
  try {
    const file = await toFile(buf, filename);
    const res = await client.audio.transcriptions.create({
      model: OPENAI_TRANSCRIBE_MODEL,
      file,
    });
    return res.text ?? null;
  } catch (err) {
    console.error("[transcribe] failed:", err);
    return null;
  }
}
