import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runAgent } from "@/lib/agent/core";
import { executeTool, runApprovedConfirmation } from "@/lib/agent/execute";
import { transcribeAudio } from "@/lib/llm/transcribe";
import { areaByIndex } from "@/lib/areas";
import {
  createTaskFromEmail,
  draftReply,
  sendApprovedReply,
  cancelDraft,
  setDraftBody,
  reshowDraft,
  getLatestPendingReply,
} from "@/lib/email/process";
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
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return ok();

  const allowedId = process.env.TELEGRAM_USER_ID;
  const fromId =
    update.callback_query?.from?.id ?? update.message?.from?.id ?? null;
  if (!allowedId || String(fromId) !== String(allowedId)) {
    return ok();
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return ok();
    }

    const message = update.message;
    if (!message) return ok();
    const chatId = String(message.chat.id);

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
    if (!inboundText) return ok();

    // Pending captures from a prior button tap.
    if (await handlePendingEmailEdit(inboundText, chatId)) return ok();
    if (await handlePendingDelegate(inboundText, chatId)) return ok();
    // Typed approval/cancel of a pending email draft — handled deterministically
    // so "send it" can never be misread as a settings change.
    if (await handleTypedReplyApproval(inboundText, chatId)) return ok();

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
    return ok();
  }
}

// Consume a pending delegate-name capture, if any. Returns true if handled.
async function handlePendingDelegate(text: string, chatId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data: pending } = await sb
    .from("agent_events")
    .select("id, payload")
    .eq("user_id", USER_ID)
    .eq("type", "pending_delegate")
    .is("processed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const taskId = pending?.payload?.task_id as string | undefined;
  if (!pending || !taskId) return false;

  await sb
    .from("agent_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", pending.id);
  const person = text.slice(0, 80);
  await executeTool("delegate_task", { task_id: taskId, person }, { userId: USER_ID, chatId });
  await sendMessage(
    `Delegated to ${person}. I'll keep checking with you until it's fully done.`,
    { chatId },
  );
  return true;
}

// Consume a pending email-draft edit, if any. Returns true if handled.
async function handlePendingEmailEdit(text: string, chatId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data: pending } = await sb
    .from("agent_events")
    .select("id, payload")
    .eq("user_id", USER_ID)
    .eq("type", "pending_email_edit")
    .is("processed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const confId = pending?.payload?.confirmation_id as string | undefined;
  if (!pending || !confId) return false;
  await sb
    .from("agent_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", pending.id);
  await setDraftBody(confId, text);
  await reshowDraft(confId, chatId);
  return true;
}

// If an email draft is pending and the user types an approval ("send it") or a
// cancel, act on it directly — never route these to the agent.
async function handleTypedReplyApproval(text: string, chatId: string): Promise<boolean> {
  const pending = await getLatestPendingReply(USER_ID);
  if (!pending) return false;
  const t = text.trim().toLowerCase().replace(/[.!]+$/g, "").trim();
  const approve =
    /^(send|send it|send the (draft|reply|email)|approve( it)?|yes,? ?send( it)?|go ahead( and send( it)?)?|ship it|looks good,? ?send it)$/.test(t);
  const cancel = /^(cancel( it)?|don'?t send|do not send|discard|never ?mind)$/.test(t);
  if (approve) {
    const status = await sendApprovedReply(pending.id);
    await sendMessage(`✅ ${status}`, { chatId });
    return true;
  }
  if (cancel) {
    await cancelDraft(pending.id);
    await sendMessage("✖ Canceled the pending draft.", { chatId });
    return true;
  }
  return false;
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
      if (chatId && msgId) await editMessageText(chatId, msgId, "(Already resolved.)");
      return;
    }
    if (decision === "reject") {
      await answerCallbackQuery(cbId, "Rejected");
      if (chatId && msgId) await editMessageText(chatId, msgId, "❌ Rejected — I won't do it.");
      return;
    }
    const summary = await runApprovedConfirmation(
      { id: claimed.id, action_type: claimed.action_type, payload: claimed.payload },
      ctx,
    );
    await answerCallbackQuery(cbId, "Approved");
    if (chatId && msgId) await editMessageText(chatId, msgId, `✅ Approved.\n${summary}`);
    return;
  }

  // Area pick: ta:<taskId>:<areaIndex>
  if (data.startsWith("ta:")) {
    const [, taskId, idxStr] = data.split(":");
    const area = taskId ? areaByIndex(Number(idxStr)) : undefined;
    if (taskId && area) {
      await executeTool("update_task", { task_id: taskId, area }, ctx);
      await answerCallbackQuery(cbId, `Area: ${area}`);
      if (chatId && msgId) await editMessageText(chatId, msgId, `Area set: ${area}.`);
    } else {
      await answerCallbackQuery(cbId);
    }
    return;
  }

  // Priority pick: tp:<taskId>:<1|2|3>
  if (data.startsWith("tp:")) {
    const [, taskId, p] = data.split(":");
    const map: Record<string, { urgency: string; priority_score: number; label: string }> = {
      "1": { urgency: "high", priority_score: 3, label: "P1 · high" },
      "2": { urgency: "normal", priority_score: 2, label: "P2 · normal" },
      "3": { urgency: "low", priority_score: 1, label: "P3 · low" },
    };
    const m = p ? map[p] : undefined;
    if (taskId && m) {
      await executeTool(
        "update_task",
        { task_id: taskId, urgency: m.urgency, priority_score: m.priority_score },
        ctx,
      );
      await answerCallbackQuery(cbId, m.label);
      if (chatId && msgId) await editMessageText(chatId, msgId, `Priority: ${m.label}.`);
    } else {
      await answerCallbackQuery(cbId);
    }
    return;
  }

  // Delegated follow-up: dg:<taskId>:<done|pending>
  if (data.startsWith("dg:")) {
    const [, taskId, decision] = data.split(":");
    if (taskId && decision === "done") {
      await executeTool(
        "complete_task",
        { task_id: taskId, reason: "delegate completed (confirmed by user)" },
        ctx,
      );
      await answerCallbackQuery(cbId, "Marked done");
      if (chatId && msgId) await editMessageText(chatId, msgId, "✅ Done — delegate finished it.");
    } else if (taskId && decision === "pending") {
      await executeTool(
        "snooze_task",
        {
          task_id: taskId,
          until: new Date(Date.now() + 86400000).toISOString(),
          reason: "still pending with delegate",
        },
        ctx,
      );
      await answerCallbackQuery(cbId, "I'll keep checking");
      if (chatId && msgId) await editMessageText(chatId, msgId, "⏳ Still pending — I'll check again tomorrow.");
    } else {
      await answerCallbackQuery(cbId);
    }
    return;
  }

  // Email summary actions: em:<emailId>:<task|draft>
  if (data.startsWith("em:")) {
    const [, emailId, action] = data.split(":");
    if (emailId && action === "task") {
      const summary = await createTaskFromEmail(emailId, ctx);
      await answerCallbackQuery(cbId, "Task created");
      if (chatId && msgId) await editMessageText(chatId, msgId, `📋 ${summary}`);
    } else if (emailId && action === "draft") {
      await answerCallbackQuery(cbId, "Drafting…");
      await draftReply(emailId, chatId);
    } else {
      await answerCallbackQuery(cbId);
    }
    return;
  }

  // Email reply gate: er:<confirmationId>:<approve|edit|cancel>
  if (data.startsWith("er:")) {
    const [, confId, action] = data.split(":");
    if (!confId) {
      await answerCallbackQuery(cbId);
      return;
    }
    if (action === "approve") {
      const status = await sendApprovedReply(confId);
      await answerCallbackQuery(cbId, "Approved");
      if (chatId && msgId) await editMessageText(chatId, msgId, `✅ ${status}`);
    } else if (action === "edit") {
      await answerCallbackQuery(cbId);
      const sb = supabaseAdmin();
      await sb
        .from("agent_events")
        .insert({ user_id: USER_ID, type: "pending_email_edit", payload: { confirmation_id: confId } });
      await sendMessage("Send me the edited reply text and I'll use it.", { chatId });
    } else if (action === "cancel") {
      await cancelDraft(confId);
      await answerCallbackQuery(cbId, "Canceled");
      if (chatId && msgId) await editMessageText(chatId, msgId, "✖ Canceled.");
    } else {
      await answerCallbackQuery(cbId);
    }
    return;
  }

  // Follow-up actions: fu:<taskId>:<done|snooze1d|snoozeask|delegate|drop>
  if (data.startsWith("fu:")) {
    const [, taskId, action] = data.split(":");
    if (!taskId) return;
    switch (action) {
      case "done":
        await executeTool("complete_task", { task_id: taskId }, ctx);
        await answerCallbackQuery(cbId, "Marked done");
        if (chatId && msgId) await editMessageText(chatId, msgId, "✅ Done.");
        break;
      case "snooze1h":
        await executeTool(
          "snooze_task",
          { task_id: taskId, until: new Date(Date.now() + 3600000).toISOString() },
          ctx,
        );
        await answerCallbackQuery(cbId, "Snoozed 1 hour");
        if (chatId && msgId) await editMessageText(chatId, msgId, "⏰ Snoozed — I'll come back in an hour.");
        break;
      case "snooze1d":
        await executeTool(
          "snooze_task",
          { task_id: taskId, until: new Date(Date.now() + 86400000).toISOString() },
          ctx,
        );
        await answerCallbackQuery(cbId, "Snoozed 1 day");
        if (chatId && msgId) await editMessageText(chatId, msgId, "😴 Snoozed — back tomorrow.");
        break;
      case "snoozeask":
        await answerCallbackQuery(cbId);
        await sendMessage('When should I resurface it? e.g. "snooze to Friday 9am".', { chatId });
        break;
      case "delegate": {
        await answerCallbackQuery(cbId);
        const sb = supabaseAdmin();
        await sb
          .from("agent_events")
          .insert({ user_id: USER_ID, type: "pending_delegate", payload: { task_id: taskId } });
        await sendMessage("Who's handling this task? Reply with their name.", { chatId });
        break;
      }
      case "drop":
        await executeTool("drop_task", { task_id: taskId }, ctx);
        await answerCallbackQuery(cbId, "Dropped");
        if (chatId && msgId) await editMessageText(chatId, msgId, "🗑 Dropped.");
        break;
      default:
        await answerCallbackQuery(cbId);
    }
    return;
  }

  await answerCallbackQuery(cbId);
}
