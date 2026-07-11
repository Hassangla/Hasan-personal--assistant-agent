import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// The bell's data: recent notifications + unread count. Auth via middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 25));
  const sb = supabaseAdmin();
  const [listRes, unreadRes] = await Promise.all([
    sb
      .from("notifications")
      .select("id,kind,title,body,url,read_at,created_at")
      .eq("user_id", USER_ID)
      .order("created_at", { ascending: false })
      .limit(limit),
    sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID)
      .is("read_at", null),
  ]);
  return NextResponse.json({
    unread: unreadRes.count ?? 0,
    items: ((listRes.data ?? []) as any[]).map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      url: n.url,
      read: !!n.read_at,
      at: n.created_at,
    })),
  });
}
