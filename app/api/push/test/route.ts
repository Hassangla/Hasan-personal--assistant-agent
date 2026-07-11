import { NextResponse } from "next/server";
import { USER_ID, USER_TIMEZONE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendPushToAll } from "@/lib/push";
import { logNotification } from "@/lib/notify";

// Fire a test notification to every registered device — with a live snapshot
// of real state, so even the test shows what notifications look like.
export const runtime = "nodejs";

const OPEN = ["open", "reminded", "escalated", "snoozed"];

export async function POST() {
  const sb = supabaseAdmin();
  const [countRes, nextRes] = await Promise.all([
    sb
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID)
      .in("status", OPEN)
      .is("delegated_to", null),
    sb
      .from("tasks")
      .select("title,due_at")
      .eq("user_id", USER_ID)
      .in("status", OPEN)
      .is("delegated_to", null)
      .not("due_at", "is", null)
      .gt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const open = countRes.count ?? 0;
  let body = `${open} open task${open === 1 ? "" : "s"} right now.`;
  if (nextRes.data) {
    const when = new Intl.DateTimeFormat("en-GB", {
      timeZone: USER_TIMEZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(nextRes.data.due_at));
    body = `${open} open task${open === 1 ? "" : "s"} · next due: ${nextRes.data.title} (${when})`;
  }

  const sent = await sendPushToAll(USER_ID, { title: "Personal Agent · test 🔔", body, url: "/" });
  await logNotification({
    userId: USER_ID,
    kind: "test",
    title: "Test notification",
    body: `${body} — delivered to ${sent} device(s).`,
    url: "/calendar",
    channels: "push",
  });
  return NextResponse.json({ ok: true, sent, body });
}
