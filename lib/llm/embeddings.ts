import "server-only";
import OpenAI from "openai";
import {
  optionalEnv,
  OPENAI_EMBEDDING_MODEL,
  EMBEDDING_DIM,
} from "@/lib/config";

let client: OpenAI | null = null;

function openai(): OpenAI | null {
  const key = optionalEnv("OPENAI_API_KEY");
  if (!key) return null;
  if (!client) client = new OpenAI({ apiKey: key });
  return client;
}

export function embeddingsAvailable(): boolean {
  return Boolean(optionalEnv("OPENAI_API_KEY"));
}

// Returns a 1536-dim embedding, or null if no provider is configured (the
// Anthropic-only path) or the vector shape doesn't match the schema column.
export async function embed(text: string): Promise<number[] | null> {
  const c = openai();
  if (!c) return null;
  const input = text.slice(0, 8000);
  try {
    const res = await c.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input,
    });
    const vec = res.data[0]?.embedding ?? null;
    if (!vec) return null;
    if (vec.length !== EMBEDDING_DIM) {
      console.warn(
        `[embeddings] model returned ${vec.length} dims, expected ${EMBEDDING_DIM}; skipping`,
      );
      return null;
    }
    return vec;
  } catch (err) {
    console.error("[embeddings] failed:", err);
    return null;
  }
}
