import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { addCalendarSource, removeCalendarSource } from "@/lib/calendar/import";

// Register (or unlink) an external calendar published as an .ics/webcal URL —
// Google secret iCal, Outlook publish link, Proton share link, .edu feeds, etc.
// Auth is enforced by middleware (session cookie); deliberately NOT under the
// public /api/calendar feed prefix.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (body.disconnect) {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await removeCalendarSource(USER_ID, id);
    return NextResponse.json({ ok: true, disconnected: true });
  }

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
