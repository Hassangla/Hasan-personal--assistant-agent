import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Conversation history for the chat page — one shared thread across every
// channel (chat, Telegram, dashboard capture). Auth via middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Math.min(120, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 60));
  const { data } = await supabaseAdmin()
    .from("messages")
    .select("id, role, content, channel, created_at")
    .eq("user_id", USER_ID)
    .in("role", ["user", "assistant"])
    .not("content", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const items = ((data ?? []) as any[])
    .reverse()
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content as string,
      channel: (m.channel as string) ?? "telegram",
      at: m.created_at as string,
    }));
  return NextResponse.json({ items });
}
