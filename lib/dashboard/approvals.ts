import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID } from "@/lib/config";
import { describeAction } from "@/lib/agent/tools";

export type Approval = {
  id: string;
  type: string;
  typeColor: string;
  area: string | null;
  title: string;
  why: string;
  previewLabel: string;
  preview: string;
  requested: string;
};
export type ResolvedItem = { id: string; title: string; status: string; color: string; when: string };
export type ApprovalsData = { pending: Approval[]; log: ResolvedItem[]; pendingCount: number };

const BLUE = "#3C6FB0";
const AMBER = "#BC8638";
const DANGER = "#C04A2E";

function describe(actionType: string, payload: any) {
  const p = payload ?? {};
  switch (actionType) {
    case "send_email":
      return {
        type: "Send email",
        typeColor: BLUE,
        title: p.subject ? `Reply: ${p.subject}` : `Email to ${p.to ?? "someone"}`,
        why: `To ${p.to ?? "—"}`,
        previewLabel: "Draft email",
        preview: (p.body ?? "").slice(0, 600),
      };
    case "send_message_external":
      return {
        type: "Send message",
        typeColor: BLUE,
        title: `Message ${p.to ?? "someone"}`,
        why: `Via ${p.channel ?? "an external channel"}`,
        previewLabel: "Draft message",
        preview: (p.text ?? "").slice(0, 600),
      };
    case "create_calendar_event_with_guests":
      return {
        type: "Calendar invite",
        typeColor: AMBER,
        title: `Event: ${p.title ?? "untitled"}`,
        why: p.guests?.length ? `Invites ${p.guests.join(", ")}` : "Creates a calendar event with guests.",
        previewLabel: "Event",
        preview: `${p.title ?? ""} — ${p.start ?? ""}${p.end ? ` → ${p.end}` : ""}`,
      };
    case "make_booking":
      return {
        type: "Irreversible",
        typeColor: DANGER,
        title: `${p.kind ?? "Booking"} booking`,
        why: "Makes a reservation — can't be undone here.",
        previewLabel: "Action",
        preview: JSON.stringify(p.details ?? {}, null, 2).slice(0, 400),
      };
    case "computer_action":
      return {
        type: "Irreversible",
        typeColor: DANGER,
        title: `Computer: ${p.action ?? "action"}`,
        why: "Performs a computer-use action on your behalf.",
        previewLabel: "Action",
        preview: JSON.stringify(p.details ?? {}, null, 2).slice(0, 400),
      };
    default:
      return {
        type: actionType,
        typeColor: BLUE,
        title: actionType,
        why: "Pending agent action.",
        previewLabel: "Action",
        preview: describeAction(actionType, p).slice(0, 400),
      };
  }
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export async function getApprovalsData(): Promise<ApprovalsData> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [pendRes, logRes] = await Promise.all([
    sb
      .from("confirmations")
      .select("id,action_type,payload,created_at")
      .eq("user_id", USER_ID)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(30),
    sb
      .from("confirmations")
      .select("id,action_type,payload,status,resolved_at")
      .eq("user_id", USER_ID)
      .in("status", ["approved", "rejected", "expired"])
      .gte("resolved_at", since)
      .order("resolved_at", { ascending: false })
      .limit(12),
  ]);

  const pending: Approval[] = ((pendRes.data ?? []) as any[]).map((c) => ({
    id: c.id,
    area: null,
    requested: relTime(c.created_at),
    ...describe(c.action_type, c.payload),
  }));

  const STATUS: Record<string, { label: string; color: string }> = {
    approved: { label: "Approved", color: "#2E8C61" },
    rejected: { label: "Denied", color: "#C04A2E" },
    expired: { label: "Expired", color: "#9A9182" },
  };
  const log: ResolvedItem[] = ((logRes.data ?? []) as any[]).map((c) => {
    const d = describe(c.action_type, c.payload);
    const s = STATUS[c.status] ?? { label: c.status, color: "#9A9182" };
    return { id: c.id, title: d.title, status: s.label, color: s.color, when: relTime(c.resolved_at) };
  });

  return { pending, log, pendingCount: pending.length };
}
