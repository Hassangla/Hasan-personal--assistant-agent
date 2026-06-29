import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { executeTool } from "@/lib/agent/execute";

// Create a goal (a plan) from the Goals page. Reuses create_plan (audited).
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const horizon = ["short", "medium", "long"].includes(body.horizon) ? body.horizon : "short";
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const r = (await executeTool(
    "create_plan",
    { horizon, title, body: typeof body.body === "string" && body.body.trim() ? body.body.trim() : undefined },
    { userId: USER_ID },
  )) as Record<string, unknown>;
  if (r && typeof r === "object" && "error" in r) {
    return NextResponse.json({ error: String(r.error) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, goal: r });
}
