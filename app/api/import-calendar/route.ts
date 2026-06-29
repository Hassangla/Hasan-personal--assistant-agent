import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { addCalendarSource } from "@/lib/calendar/import";

// Register an external calendar (Apple/Google published .ics/webcal URL) and do
// an initial import. Auth is enforced by middleware (session cookie) — this path
// is deliberately NOT under the public /api/calendar feed prefix.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  try {
    const { imported } = await addCalendarSource(USER_ID, url, label || undefined);
    return NextResponse.json({ ok: true, imported });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 });
  }
}
