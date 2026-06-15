import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { embed } from "@/lib/llm/embeddings";

// Persist a memory chunk. Embedding may be null on the Anthropic-only path;
// the text is still retained (and can be re-embedded later).
export async function storeMemory(params: {
  userId: string;
  sourceType: string;
  sourceId?: string | null;
  text: string;
}): Promise<void> {
  const text = params.text.trim();
  if (!text) return;
  const embedding = await embed(text);
  const sb = supabaseAdmin();
  const { error } = await sb.from("memory_chunks").insert({
    user_id: params.userId,
    source_type: params.sourceType,
    source_id: params.sourceId ?? null,
    text,
    embedding,
  });
  if (error) console.error("[memory] store failed:", error.message);
}

export type MemoryHit = {
  id: string;
  text: string;
  source_type: string | null;
  similarity: number;
};

// Top-N memory chunks by cosine similarity. Returns [] when no embeddings
// provider is configured.
export async function searchMemory(params: {
  userId: string;
  query: string;
  limit?: number;
}): Promise<MemoryHit[]> {
  const q = params.query.trim();
  if (!q) return [];
  const embedding = await embed(q);
  if (!embedding) return [];
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("match_memory_chunks", {
    p_user_id: params.userId,
    query_embedding: embedding,
    match_count: params.limit ?? 12,
  });
  if (error) {
    console.error("[memory] search failed:", error.message);
    return [];
  }
  return (data ?? []) as MemoryHit[];
}
