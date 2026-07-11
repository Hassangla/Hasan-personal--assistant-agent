import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { commitImport } from "@/lib/people/importer";

// Review-inbox actions for synced contacts: approve (→ real CRM person, row
// becomes the permanent link) or dismiss (stays in iCloud, never re-asked).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id || !["approve", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "id and action (approve|dismiss) required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("carddav_contacts")
    .select("id,payload,status")
    .eq("id", id)
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ ok: true, already: row.status });

  if (action === "dismiss") {
    await sb.from("carddav_contacts").update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const p: any = row.payload ?? {};
  const area = typeof body.area === "string" && body.area.trim() ? body.area.trim() : null;
  const result = await commitImport(USER_ID, [
    {
      name: p.name ?? "Unknown",
      org: p.org ?? null,
      title: p.title ?? null,
      emails: p.emails ?? [],
      phones: p.phones ?? [],
      bday: p.bday ?? null,
      note: p.note ?? null,
      area,
    },
  ]);
  const entityId = result.entityIds[0] ?? null;
  await sb
    .from("carddav_contacts")
    .update({ status: "linked", entity_id: entityId, updated_at: new Date().toISOString() })
    .eq("id", id);
  return NextResponse.json({ ok: true, entityId });
}
