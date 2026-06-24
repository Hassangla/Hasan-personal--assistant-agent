import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runApprovedConfirmation } from "@/lib/agent/execute";

// Approve or deny a pending confirmation from the Approvals page. Approve runs
// the real (gated) action via the same path as a Telegram approval; deny just
// rejects it. Auth is enforced by middleware (session cookie / x-api-secret).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action === "approve" || body.action === "deny" ? body.action : "";
  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  // Claim the pending row atomically (pending → approved/rejected) so a
  // concurrent Telegram decision can't double-fire the same action.
  const { data: claimed, error } = await sb
    .from("confirmations")
    .update({ status: action === "approve" ? "approved" : "rejected", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", USER_ID)
    .eq("status", "pending")
    .select("id, action_type, payload")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: "already resolved or not found" }, { status: 409 });

  let summary = action === "approve" ? "Approved." : "Denied.";
  if (action === "approve") {
    try {
      summary = await runApprovedConfirmation(claimed as any, { userId: USER_ID });
    } catch (e: any) {
      summary = `Approved, but the action errored: ${e?.message ?? e}`;
    }
  }
  return NextResponse.json({ ok: true, summary });
}
