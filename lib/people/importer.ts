import "server-only";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/calendar/crypto";
import { AREA_META } from "@/lib/areas";
import type { ParsedContact } from "@/lib/people/vcard";

// Contact import brain: match incoming vCards against existing CRM people
// (email → phone → normalized name), suggest a life-area from org/title, and
// commit approved rows with phones/emails encrypted at rest (AES-256-GCM) +
// SHA-256 hashes kept for dedup/idempotent re-imports.

export type PreviewItem = {
  idx: number;
  name: string;
  org: string | null;
  title: string | null;
  emails: string[];
  phones: string[];
  bday: string | null;
  note: string | null;
  decision: "new" | "merge";
  matchId: string | null;
  matchName: string | null;
  suggestedArea: string | null; // canonical area name
  include: boolean; // default selection (noise gets false)
};

const normEmail = (e: string) => e.trim().toLowerCase();
const normPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
};
const normName = (n: string) =>
  n
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9؀-ۿ]/g, "");

export const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);

// Life-area suggestion from org/title keywords.
const AREA_HINTS: [RegExp, string][] = [
  [/world ?bank|wbg|\bifc\b|wbl/i, "World Bank"],
  [/universit|college|law|professor|faculty|\bpitt\b|sjd|academi/i, "SJD"],
  [/glg|alhoot/i, "GLG-Alhoot Company"],
  [/scorp/i, "Scorp Group Ltd."],
  [/draupnir/i, "Draupnir LLC"],
];
export function suggestArea(c: Pick<ParsedContact, "org" | "title">): string | null {
  const hay = `${c.org ?? ""} ${c.title ?? ""}`;
  for (const [re, area] of AREA_HINTS) if (re.test(hay)) return area;
  return null;
}

type ExistingPerson = {
  id: string;
  name: string;
  emailHashes: Set<string>;
  phoneHashes: Set<string>;
  nameNorm: string;
  metadata: any;
};

async function loadExisting(userId: string): Promise<ExistingPerson[]> {
  const { data } = await supabaseAdmin()
    .from("entities")
    .select("id,name,metadata")
    .eq("user_id", userId)
    .eq("kind", "person")
    .limit(2000);
  return ((data ?? []) as any[]).map((p) => {
    const md = p.metadata ?? {};
    const emailHashes = new Set<string>((md.email_hashes as string[]) ?? []);
    if (typeof md.email === "string" && md.email.includes("@")) emailHashes.add(hashOf(normEmail(md.email)));
    const phoneHashes = new Set<string>((md.phone_hashes as string[]) ?? []);
    if (typeof md.phone === "string") phoneHashes.add(hashOf(normPhone(md.phone)));
    return {
      id: p.id,
      name: p.name,
      emailHashes,
      phoneHashes,
      nameNorm: normName(p.name ?? ""),
      metadata: md,
    };
  });
}

export async function previewImport(userId: string, contacts: ParsedContact[]): Promise<PreviewItem[]> {
  const existing = await loadExisting(userId);
  const byEmail = new Map<string, ExistingPerson>();
  const byPhone = new Map<string, ExistingPerson>();
  const byName = new Map<string, ExistingPerson>();
  for (const p of existing) {
    for (const h of p.emailHashes) if (!byEmail.has(h)) byEmail.set(h, p);
    for (const h of p.phoneHashes) if (!byPhone.has(h)) byPhone.set(h, p);
    if (p.nameNorm && !byName.has(p.nameNorm)) byName.set(p.nameNorm, p);
  }

  const seenInFile = new Set<string>();
  return contacts.slice(0, 1500).map((c, idx) => {
    const eHashes = c.emails.map((e) => hashOf(normEmail(e)));
    const pHashes = c.phones.map((p) => hashOf(normPhone(p))).filter((h) => h !== hashOf(""));
    let match: ExistingPerson | null = null;
    for (const h of eHashes) if (byEmail.has(h)) { match = byEmail.get(h)!; break; }
    if (!match) for (const h of pHashes) if (byPhone.has(h)) { match = byPhone.get(h)!; break; }
    if (!match) {
      const nn = normName(c.name);
      if (nn && byName.has(nn)) match = byName.get(nn)!;
    }

    // In-file duplicate collapse: same fingerprint appearing twice → second off.
    const fp = eHashes[0] ?? pHashes[0] ?? normName(c.name);
    const dupInFile = fp ? seenInFile.has(fp) : false;
    if (fp) seenInFile.add(fp);

    const substantive = c.emails.length > 0 || c.phones.length > 0 || !!c.org;
    return {
      idx,
      name: c.name,
      org: c.org,
      title: c.title,
      emails: c.emails,
      phones: c.phones,
      bday: c.bday,
      note: c.note,
      decision: match ? ("merge" as const) : ("new" as const),
      matchId: match?.id ?? null,
      matchName: match?.name ?? null,
      suggestedArea: suggestArea(c),
      include: substantive && !dupInFile,
    };
  });
}

export type CommitItem = {
  name: string;
  org?: string | null;
  title?: string | null;
  emails?: string[];
  phones?: string[];
  bday?: string | null;
  note?: string | null;
  area?: string | null; // canonical area name (validated)
  matchId?: string | null;
};

const CANONICAL = new Set(AREA_META.map((a) => a.canonical));

export async function commitImport(
  userId: string,
  items: CommitItem[],
): Promise<{ added: number; merged: number; skipped: number; entityIds: (string | null)[] }> {
  const sb = supabaseAdmin();
  const existing = await loadExisting(userId);
  const byId = new Map(existing.map((p) => [p.id, p]));
  const byEmail = new Map<string, ExistingPerson>();
  for (const p of existing) for (const h of p.emailHashes) if (!byEmail.has(h)) byEmail.set(h, p);

  let added = 0,
    merged = 0,
    skipped = 0;
  const entityIds: (string | null)[] = [];

  for (const raw of items.slice(0, 1500)) {
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
    if (!name) {
      skipped++;
      entityIds.push(null);
      continue;
    }
    const emails = (raw.emails ?? []).map(normEmail).filter((e) => e.includes("@")).slice(0, 6);
    const phones = (raw.phones ?? []).map((p) => String(p).trim()).filter(Boolean).slice(0, 6);
    const emailHashes = emails.map((e) => hashOf(e));
    const phoneHashes = phones.map((p) => hashOf(normPhone(p)));
    const area = raw.area && CANONICAL.has(raw.area) ? raw.area : null;

    // Idempotency: even without a matchId, an email fingerprint match merges.
    let target = raw.matchId ? byId.get(raw.matchId) ?? null : null;
    if (!target) for (const h of emailHashes) if (byEmail.has(h)) { target = byEmail.get(h)!; break; }

    if (target) {
      const md = { ...(target.metadata ?? {}) };
      // Union encrypted contact handles.
      const oldEmails: string[] = md.emails_enc ? JSON.parse(decryptSecret(md.emails_enc)) : [];
      const oldPhones: string[] = md.phones_enc ? JSON.parse(decryptSecret(md.phones_enc)) : [];
      const allEmails = [...new Set([...oldEmails, ...emails])];
      const allPhones = [...new Set([...oldPhones, ...phones])];
      if (allEmails.length) md.emails_enc = encryptSecret(JSON.stringify(allEmails));
      if (allPhones.length) md.phones_enc = encryptSecret(JSON.stringify(allPhones));
      md.email_hashes = [...new Set([...(md.email_hashes ?? []), ...emailHashes])];
      md.phone_hashes = [...new Set([...(md.phone_hashes ?? []), ...phoneHashes])];
      // Fill blanks only — never clobber what the agent already learned.
      if (!md.org && raw.org) md.org = String(raw.org).slice(0, 120);
      if (!md.title && raw.title) md.title = String(raw.title).slice(0, 120);
      if (!md.role && (raw.title || raw.org)) md.role = String(raw.title || raw.org).slice(0, 120);
      if (!md.bday && raw.bday) md.bday = String(raw.bday).slice(0, 20);
      if (!md.area && area) md.area = area;
      if (md.email) delete md.email; // plaintext handle superseded by emails_enc
      md.source = md.source ?? "vcard-import";
      await sb.from("entities").update({ metadata: md }).eq("id", target.id).eq("user_id", userId);
      merged++;
      entityIds.push(target.id);
    } else {
      const md: Record<string, unknown> = {
        role: (raw.title || raw.org || "Contact") as string,
        org: raw.org ? String(raw.org).slice(0, 120) : undefined,
        title: raw.title ? String(raw.title).slice(0, 120) : undefined,
        bday: raw.bday ? String(raw.bday).slice(0, 20) : undefined,
        note: raw.note ? String(raw.note).slice(0, 400) : undefined,
        area: area ?? undefined,
        email_hashes: emailHashes,
        phone_hashes: phoneHashes,
        emails_enc: emails.length ? encryptSecret(JSON.stringify(emails)) : undefined,
        phones_enc: phones.length ? encryptSecret(JSON.stringify(phones)) : undefined,
        source: "vcard-import",
      };
      Object.keys(md).forEach((k) => md[k] === undefined && delete md[k]);
      const { data: ins, error } = await sb
        .from("entities")
        .insert({ user_id: userId, kind: "person", name, metadata: md })
        .select("id")
        .single();
      if (error) {
        skipped++;
        entityIds.push(null);
        continue;
      }
      // Register fingerprints so a duplicate later in the same file merges.
      const ep: ExistingPerson = {
        id: ins.id,
        name,
        emailHashes: new Set(emailHashes),
        phoneHashes: new Set(phoneHashes),
        nameNorm: "",
        metadata: md,
      };
      byId.set(ins.id, ep);
      for (const h of emailHashes) if (!byEmail.has(h)) byEmail.set(h, ep);
      added++;
      entityIds.push(ins.id as string);
    }
  }
  return { added, merged, skipped, entityIds };
}

// Server-side display helper: first decrypted email of a person, if any.
export function firstEmailOf(metadata: any): string {
  try {
    if (metadata?.emails_enc) {
      const arr = JSON.parse(decryptSecret(metadata.emails_enc));
      if (Array.isArray(arr) && arr[0]) return String(arr[0]);
    }
  } catch {
    /* wrong key or malformed — treat as none */
  }
  return typeof metadata?.email === "string" ? metadata.email : "";
}
