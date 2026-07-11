import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { commitImport, suggestArea } from "@/lib/people/importer";

// Review-inbox actions for synced contacts: approve (→ real CRM person, row
// becomes the permanent link) or dismiss (stays in iCloud, never re-asked).
// Batch variants process the oldest N pending per call — the client loops
// until none remain, keeping each request inside the function time budget.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "approve_batch" || action === "dismiss_batch") {
    const sb = supabaseAdmin();
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 100));
    const { data: rows } = await sb
      .from("carddav_contacts")
      .select("id,payload,name")
      .eq("user_id", USER_ID)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);
    const batch = (rows ?? []) as any[];

    if (action === "dismiss_batch") {
      if (batch.length) {
        await sb
          .from("carddav_contacts")
          .update({ status: "dismissed", updated_at: new Date().toISOString() })
          .in("id", batch.map((r) => r.id));
      }
    } else if (batch.length) {
      // Bulk approve: one commitImport call (single existing-people load),
      // areas auto-suggested from org/title where inferable.
      const items = batch.map((r) => {
        const p: any = r.payload ?? {};
        return {
          name: (p.name as string) ?? r.name ?? "Unknown",
          org: p.org ?? null,
          title: p.title ?? null,
          emails: p.emails ?? [],
          phones: p.phones ?? [],
          bday: p.bday ?? null,
          note: p.note ?? null,
          area: suggestArea({ org: p.org ?? null, title: p.title ?? null }),
        };
      });
      const result = await commitImport(USER_ID, items);
      const now = new Date().toISOString();
      for (let i = 0; i < batch.length; i++) {
        await sb
          .from("carddav_contacts")
          .update({ status: "linked", entity_id: result.entityIds[i] ?? null, updated_at: now })
          .eq("id", batch[i].id);
      }
    }

    const { count: remaining } = await sb
      .from("carddav_contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID)
      .eq("status", "pending");
    return NextResponse.json({ ok: true, processed: batch.length, remaining: remaining ?? 0 });
  }

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
