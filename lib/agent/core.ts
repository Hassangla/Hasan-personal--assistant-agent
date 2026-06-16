import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/llm/anthropic";
import { modelFor, complexityForKind, type Complexity } from "@/lib/llm/models";
import { supabaseAdmin } from "@/lib/supabase/server";
import { searchMemory } from "@/lib/memory";
import { buildSystemPrompt } from "@/lib/agent/systemPrompt";
import { anthropicTools } from "@/lib/agent/tools";
import { executeTool } from "@/lib/agent/execute";

export type AgentTrigger = "inbound" | "tick" | "followup" | "email" | "calendar";

const MAX_TOOL_ITERATIONS = 8;
const MAX_TOKENS = 1500;
const HISTORY_LIMIT = 20;

type Msg = { role: "user" | "assistant"; content: string };

// Reconstruct prior turns from stored messages, guaranteeing the alternation
// and user-first ordering the Messages API requires (collapse consecutive
// same-role rows; drop any leading assistant turns).
function normalizeHistory(rows: Msg[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of rows) {
    const text = (m.content ?? "").trim();
    if (!text) continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${text}`;
    } else {
      out.push({ role, content: text });
    }
  }
  while (out.length && out[0]!.role === "assistant") out.shift();
  return out;
}

async function persistMessage(
  userId: string,
  role: "user" | "assistant" | "tool",
  content: string | null,
  toolCalls?: unknown,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("messages").insert({
    user_id: userId,
    channel: "telegram",
    role,
    content,
    tool_calls: toolCalls ?? null,
  });
}

// The shared agent core. Reactive (Telegram) and proactive (tick) triggers both
// run through here. Returns the final assistant text; the caller decides how to
// deliver it.
export async function runAgent(params: {
  trigger: AgentTrigger;
  userId: string;
  inboundText?: string;
  contextHint?: string;
  chatId?: string;
  complexity?: Complexity; // override the model tier
  model?: string; // hard override
}): Promise<string> {
  const { trigger, userId } = params;
  const model =
    params.model ?? modelFor(params.complexity ?? complexityForKind(trigger));
  const proactive = trigger !== "inbound";
  const sb = supabaseAdmin();

  // 1. History.
  const { data: rows } = await sb
    .from("messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = normalizeHistory(((rows ?? []) as Msg[]).slice().reverse());

  // 2. Ambient memory.
  const memoryQuery = params.inboundText || params.contextHint || "";
  const hits = memoryQuery
    ? await searchMemory({ userId, query: memoryQuery, limit: 12 })
    : [];
  const memoryBlock = hits.length
    ? hits.map((h, i) => `(${i + 1}) ${h.text}`).join("\n")
    : undefined;

  // 3. System prompt + tools.
  const system = buildSystemPrompt({
    memoryBlock,
    proactive,
    contextHint: proactive ? undefined : params.contextHint,
  });
  const tools = anthropicTools() as unknown as Anthropic.Tool[];

  // 4. Seed the conversation.
  const convo: Anthropic.MessageParam[] = [...history];
  const userTurn =
    params.inboundText?.trim() ||
    params.contextHint?.trim() ||
    "(proactive trigger — decide what to do)";
  // Merge into a trailing user turn if history ended on one (can happen when a
  // prior turn stored no assistant reply) so roles stay strictly alternating.
  const tail = convo[convo.length - 1];
  if (tail && tail.role === "user" && typeof tail.content === "string") {
    tail.content = `${tail.content}\n\n${userTurn}`;
  } else {
    convo.push({ role: "user", content: userTurn });
  }

  if (params.inboundText?.trim()) {
    await persistMessage(userId, "user", params.inboundText.trim());
  }

  // 5. Tool loop (hard-capped to prevent runaway loops — spec pitfall #3).
  const ctx = { userId, chatId: params.chatId };
  const client = anthropic();
  let finalText = "";
  const usedTools: { name: string; input: unknown }[] = [];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const resp = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: convo,
        tools,
      });

      const textOut = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (textOut) finalText = textOut;

      convo.push({
        role: "assistant",
        content: resp.content as unknown as Anthropic.ContentBlockParam[],
      });

      if (resp.stop_reason !== "tool_use") break;

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        usedTools.push({ name: tu.name, input: tu.input });
        const out = await executeTool(tu.name, tu.input, ctx);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        });
      }
      convo.push({ role: "user", content: results });

      if (i === MAX_TOOL_ITERATIONS - 1) {
        console.warn("[agent] hit max tool iterations; stopping");
      }
    }
  } catch (err: any) {
    console.error("[agent] model loop failed:", err?.message ?? err);
    finalText =
      finalText ||
      (proactive ? "" : "Sorry — I hit an error processing that. Try again?");
  }

  // 6. Persist outcome.
  if (usedTools.length) {
    await persistMessage(userId, "tool", null, usedTools);
  }
  if (finalText) {
    await persistMessage(userId, "assistant", finalText, usedTools.length ? usedTools : null);
  }

  return finalText;
}
