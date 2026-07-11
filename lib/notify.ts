import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

// The notification ledger behind the bell. Every proactive send logs a row
// here so "what was that notification?" always has an answer.

export type NotificationKind = "task_nudge" | "meeting" | "test" | "system";

export async function logNotification(o: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  url?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  channels?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin().from("notifications").insert({
      user_id: o.userId,
      kind: o.kind,
      title: o.title.slice(0, 200),
      body: o.body ? o.body.slice(0, 400) : null,
      url: o.url ?? null,
      resource_type: o.resourceType ?? null,
      resource_id: o.resourceId ?? null,
      channels: o.channels ?? null,
    });
  } catch (e) {
    console.error("[notify] log failed:", e);
  }
}
