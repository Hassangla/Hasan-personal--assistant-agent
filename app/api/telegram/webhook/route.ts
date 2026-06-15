import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agent/core";
import { executeTool, runApprovedConfirmation } from "@/lib/agent/execute";
import { transcribeAudio } from "@/lib/llm/transcribe";
import {
  sendMessage,
  answerCallbackQuery,
  editMessageText,
  getFilePath,
  downloadFile,
} from "@/lib/telegram/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  // 1. Verify the webhook secret.
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return ok();

  // 2. Verify the sender — the bot only ever talks to its owner.
  const allowedId = process.env.TELEGRAM_USER_ID;
  const fromId =
    update.callback_query?.from?.id ?? update.message?.from?.id ?? null;
  if (!allowedId || String(fromId) !== String(allowedId)) {
    return ok(); // silently ignore everyone else
  }

  try {
    // 3. Approve/Reject + follow-up button taps.
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return ok();
    }

    const message = update.message;
    if (!message) return ok();
    const chatId = String(message.chat.id);

    // 4. Resolve inbound text (typed or transcribed voice).
    let inboundText: string | undefined = message.text?.trim();
    const voice = message.voice ?? message.audio;
    if (!inboundText && voice?.file_id) {
      const path = await getFilePath(voice.file_id);
      if (path) {
        const buf = await downloadFile(path);
        const transcript = await transcribeAudio(buf, "voice.ogg");
        if (transcript) {
          inboundText = transcript;
        } else {
          await sendMessage(
            "I couldn't transcribe that voice note — can you type it?",
            { chatId },
          );
          return ok();
        }
      }
    }
    if (!inboundText) return ok(); // sticker / unsupported — nothing to do

    // 5. Run the agent and reply.
    const reply = await runAgent({
      trigger: "inbound",
      userId: USER_ID,
      inboundText,
      chatId,
    });
    if (reply) await sendMessage(reply, { chatId });
    return ok();
  } catch (err: any) {
    console.error("[telegram] webhook error:", err?.message ?? err);
    return ok(); // never make Telegram retry-storm us
  }
}

async function handleCallback(cb: any): Promise<void> {
  const data: string = cb.data ?? "";
  const cbId: string = cb.id;
  const chatId = cb.message ? String(cb.message.chat.id) : undefined;
  const msgId: number | undefined = cb.message?.message_id;
  const ctx = { userId: USER_ID, chatId };

  // Confirmation gate: cf:<confirmationId>:<approve|reject>
  if (data.startsWith("cf:")) {
    const [, id, decision] = data.split(":");
    if (!id) return;
    const sb = supabaseAdmin();

    // Atomically claim the pending confirmation (prevents double-taps firing twice).
    const target = decision === "approve" ? "approved" : "rejected";
    const { data: claimed } = await sb
      .from("confirmations")
      .update({ status: target, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", USER_ID)
      .eq("status", "pending")
      .select("id, action_type, payload")
      .maybeSingle();

    if (!claimed) {
      await answerCallbackQuery(cbId, "Already resolved.");
      if (chatId && msgId)
        await editMessageText(chatId, msgId, "(Already resolved.)");
      return;
    }

    if (decision === "reject") {
      await answerCallbackQuery(cbId, "Rejected");
      if (chatId && msgId)
        await editMessageText(chatId, msgId, "❌ Rejected — I won't do it.");
      return;
    }

    const summary = await runApprovedConfirmation(
      { id: claimed.id, action_type: claimed.action_type, payload: claimed.payload },
      ctx,
    );
    await answerCallbackQuery(cbId, "Approved");
    if (chatId && msgId)
      await editMessageText(chatId, msgId, `✅ Approved.\n${summary}`);
    return;
  }

  // Follow-up actions: fu:<taskId>:<done|snooze1d|snoozeask|drop>
  if (data.startsWith("fu:")) {
    const [, taskId, action] = data.split(":");
    if (!taskId) return;
    switch (action) {
      case "done":
        await executeTool("complete_task", { task_id: taskId }, ctx);
        await answerCallbackQuery(cbId, "Marked done");
        if (chatId && msgId) await editMessageText(chatId, msgId, "✅ Done.");
        break;
      case "snooze1d":
        await executeTool(
          "snooze_task",
          { task_id: taskId, until: new Date(Date.now() + 86400000).toISOString() },
          ctx,
        );
        await answerCallbackQuery(cbId, "Snoozed 1 day");
        if (chatId && msgId) await editMessageText(chatId, msgId, "😴 Snoozed 1 day.");
        break;
      case "drop":
        await executeTool("drop_task", { task_id: taskId }, ctx);
        await answerCallbackQuery(cbId, "Dropped");
        if (chatId && msgId) await editMessageText(chatId, msgId, "🗑 Dropped.");
        break;
      case "snoozeask":
        await answerCallbackQuery(cbId);
        await sendMessage('When should I resurface it? e.g. "snooze to Friday 9am".', {
          chatId,
        });
        break;
      default:
        await answerCallbackQuery(cbId);
    }
    return;
  }

  await answerCallbackQuery(cbId);
}
