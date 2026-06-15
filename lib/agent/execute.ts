import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/client";
import {
  getTool,
  describeAction,
  type ToolContext,
  type ToolResult,
} from "@/lib/agent/tools";

// ---------------------------------------------------------------------------
// Tool dispatch + the confirmation gate.
//   - reversible tools run immediately, then write an audit_log row.
//   - irreversible tools NEVER run here. They create a pending `confirmations`
//     row, ask the user on Telegram with Approve/Reject buttons, and only run
//     later via runApprovedConfirmation() once approved.
// ---------------------------------------------------------------------------

async function writeAudit(params: {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  payload: unknown;
  reversible: boolean;
  undoPayload?: unknown;
}): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("audit_log").insert({
    user_id: params.userId,
    actor: "agent",
    action: params.action,
    resource_type: params.resourceType ?? null,
    resource_id: params.resourceId ?? null,
    payload: params.payload ?? null,
    reversible: params.reversible,
    undo_payload: params.undoPayload ?? null,
  });
  if (error) console.error("[audit] write failed:", error.message);
}

function splitUndo(result: ToolResult): { forModel: Record<string, unknown>; undo: unknown } {
  const { _undo, ...rest } = result;
  return { forModel: rest, undo: _undo ?? null };
}

// Main entry used by the agent loop.
export async function executeTool(
  name: string,
  input: any,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) return { error: `Unknown tool: ${name}` };

  // --- irreversible: route through the gate, never execute here ---
  if (!tool.reversible) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("confirmations")
      .insert({
        user_id: ctx.userId,
        action_type: name,
        payload: input,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) {
      return { error: `Failed to create confirmation: ${error?.message}` };
    }
    const confirmationId = data.id as string;
    await sendMessage(
      `⚠️ Approval needed:\n\n${describeAction(name, input)}`,
      {
        chatId: ctx.chatId,
        buttons: [
          [
            { text: "✅ Approve", callback_data: `cf:${confirmationId}:approve` },
            { text: "❌ Reject", callback_data: `cf:${confirmationId}:reject` },
          ],
        ],
      },
    );
    return {
      status: "awaiting_confirmation",
      confirmationId,
      message: "Awaiting the user's approval — do not claim this is done.",
    };
  }

  // --- reversible: execute now, then audit ---
  try {
    const result = (await tool.handler(input, ctx)) as ToolResult;
    const { forModel, undo } = splitUndo(result ?? {});
    await writeAudit({
      userId: ctx.userId,
      action: name,
      resourceType: tool.resourceType,
      resourceId: (forModel.id as string) ?? (forModel.capture_id as string) ?? null,
      payload: input,
      reversible: true,
      undoPayload: undo,
    });
    return forModel;
  } catch (err: any) {
    console.error(`[execute] ${name} failed:`, err?.message ?? err);
    return { error: String(err?.message ?? err) };
  }
}

// Runs the real action for an APPROVED confirmation (called from the Telegram
// webhook). Audits it. Returns a short human summary for the chat.
export async function runApprovedConfirmation(
  confirmation: { id: string; action_type: string; payload: any },
  ctx: ToolContext,
): Promise<string> {
  const tool = getTool(confirmation.action_type);
  if (!tool) return `Unknown action: ${confirmation.action_type}`;
  try {
    const result = (await tool.handler(confirmation.payload, ctx)) as ToolResult;
    const { forModel, undo } = splitUndo(result ?? {});
    await writeAudit({
      userId: ctx.userId,
      action: confirmation.action_type,
      resourceType: tool.resourceType,
      resourceId: (forModel.id as string) ?? null,
      payload: confirmation.payload,
      reversible: false,
      undoPayload: undo,
    });
    return `Done: ${confirmation.action_type}.`;
  } catch (err: any) {
    console.error(`[execute] approved ${confirmation.action_type} failed:`, err?.message ?? err);
    return `Failed: ${confirmation.action_type} — ${err?.message ?? err}`;
  }
}
