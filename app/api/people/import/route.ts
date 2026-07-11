import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/config";
import { parseVcf } from "@/lib/people/vcard";
import { previewImport, commitImport, type CommitItem } from "@/lib/people/importer";

// Contact import, two-phase: {mode:"preview", vcf} parses + matches without
// writing anything; {mode:"commit", items} writes the user-approved rows
// (emails/phones encrypted at rest). Auth via middleware. The client strips
// photos before upload, so even large address books fit the body limit.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (body.mode === "preview") {
    const vcf = typeof body.vcf === "string" ? body.vcf : "";
    if (!vcf.trim()) return NextResponse.json({ error: "vcf text required" }, { status: 400 });
    if (vcf.length > 3_500_000) {
      return NextResponse.json({ error: "file too large even without photos — split the export" }, { status: 413 });
    }
    const contacts = parseVcf(vcf);
    if (!contacts.length) return NextResponse.json({ error: "no contacts found in that file" }, { status: 400 });
    const items = await previewImport(USER_ID, contacts);
    return NextResponse.json({ ok: true, items });
  }

  if (body.mode === "commit") {
    const items = Array.isArray(body.items) ? (body.items as CommitItem[]) : [];
    if (!items.length) return NextResponse.json({ error: "items required" }, { status: 400 });
    const result = await commitImport(USER_ID, items);
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ error: "mode must be preview | commit" }, { status: 400 });
}
