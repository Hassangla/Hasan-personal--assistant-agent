import "server-only";
import { requireEnv } from "@/lib/config";

const API = "https://api.telegram.org";

function token(): string {
  return requireEnv("TELEGRAM_BOT_TOKEN");
}

// The single user's chat id — the bot only ever talks to them.
export function defaultChatId(): string {
  return requireEnv("TELEGRAM_USER_ID");
}

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = InlineButton[][];

async function tgCall(
  method: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${API}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false }));
  if (!json.ok) {
    console.error(`[telegram] ${method} failed:`, JSON.stringify(json));
  }
  return json;
}

// Proactive-Telegram kill switch: once the user moves to in-app chat + push,
// agent-initiated sends (no explicit chatId) are suppressed when app_config
// proactive_telegram = 'off'. Replies to the user's own Telegram messages
// (explicit chatId) always deliver. Cached for a minute per warm lambda.
let tgFlagCache: { value: boolean; at: number } | null = null;
async function proactiveTelegramEnabled(): Promise<boolean> {
  if (tgFlagCache && Date.now() - tgFlagCache.at < 60_000) return tgFlagCache.value;
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const { data } = await supabaseAdmin().from("app_config").select("value").eq("key", "proactive_telegram").maybeSingle();
    const value = (data?.value ?? "on") !== "off";
    tgFlagCache = { value, at: Date.now() };
    return value;
  } catch {
    return true; // fail open — better a duplicate ping than a silent drop
  }
}

// Plain text by default: agent replies often contain underscores/asterisks
// that would break Telegram's Markdown parser and 400 the whole message.
export async function sendMessage(
  text: string,
  opts?: { chatId?: string; buttons?: InlineKeyboard; parseMode?: "HTML" | "MarkdownV2" },
): Promise<{ messageId?: number }> {
  if (!opts?.chatId && !(await proactiveTelegramEnabled())) {
    return {}; // proactive send suppressed — push + bell carry it now
  }
  const json = await tgCall("sendMessage", {
    chat_id: opts?.chatId ?? defaultChatId(),
    text: text.slice(0, 4096),
    ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
    ...(opts?.buttons
      ? { reply_markup: { inline_keyboard: opts.buttons } }
      : {}),
  });
  return { messageId: json?.result?.message_id };
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await tgCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

// Used to settle a confirmation message: rewrite the text and drop the buttons.
export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
): Promise<void> {
  await tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4096),
    reply_markup: { inline_keyboard: [] },
  });
}

export async function getFilePath(fileId: string): Promise<string | null> {
  const json = await tgCall("getFile", { file_id: fileId });
  return json?.result?.file_path ?? null;
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const res = await fetch(`${API}/file/bot${token()}/${filePath}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
