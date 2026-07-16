import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

// Global search across tasks, people, and goals. Powers the header search box.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ tasks: [], people: [], goals: [] });
  const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
  const sb = supabaseAdmin();

  const [taskRes, peopleRes, goalRes] = await Promise.all([
    sb
      .from("tasks")
      .select("id,title,status,area_id")
      .eq("user_id", USER_ID)
      .in("status", ["open", "reminded", "escalated", "snoozed", "done"])
      .ilike("title", like)
      .order("updated_at", { ascending: false })
      .limit(6),
    sb
      .from("entities")
      .select("id,name")
      .eq("user_id", USER_ID)
      .eq("kind", "person")
      .ilike("name", like)
      .limit(5),
    sb
      .from("plans")
      .select("id,title,horizon")
      .eq("user_id", USER_ID)
      .ilike("title", like)
      .limit(4),
  ]);

  return NextResponse.json({
    tasks: ((taskRes.data ?? []) as any[]).map((t) => ({ id: t.id, title: t.title, done: t.status === "done" })),
    people: ((peopleRes.data ?? []) as any[]).map((p) => ({ id: p.id, name: p.name })),
    goals: ((goalRes.data ?? []) as any[]).map((g) => ({ id: g.id, title: g.title })),
  });
}
