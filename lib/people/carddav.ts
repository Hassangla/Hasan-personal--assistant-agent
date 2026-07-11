import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/calendar/crypto";
import { extractHrefs } from "@/lib/calendar/caldav";
import { parseVcf, type ParsedContact } from "@/lib/people/vcard";
import { previewImport, commitImport } from "@/lib/people/importer";

// Live iCloud Contacts sync (CardDAV, PULL-ONLY — Phase A). Known people get
// enriched automatically (fill-blanks merge); unknown contacts land in the
// review inbox (carddav_contacts.status = pending) so the CRM stays curated.
// Reuses the calendar sync's credential pattern — same app-specific password.

const UA = "PersonalAgent/1.0 (+contacts-sync)";
export const ICLOUD_CONTACTS = "https://contacts.icloud.com";
const SYNC_INTERVAL_MS = 30 * 60 * 1000;

type Account = {
  id: string;
  user_id: string;
  server: string;
  username: string;
  password_enc: string;
  addressbooks: { url: string; name: string }[] | null;
};

const auth = (u: string, p: string) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");

async function dav(method: string, url: string, authz: string, depth: string, body: string) {
  const res = await fetch(url, {
    method,
    headers: { authorization: authz, depth, "content-type": "application/xml; charset=utf-8", "user-agent": UA },
    body,
    redirect: "follow",
  });
  return { status: res.status, text: await res.text(), finalUrl: res.url };
}

// Addressbook collections from a Depth:1 PROPFIND on the home set.
function extractAddressbooks(xml: string, baseUrl: string): { url: string; name: string }[] {
  const out: { url: string; name: string }[] = [];
  for (const b of xml.split(/<\/(?:[a-z0-9]+:)?response>/i)) {
    if (!/<(?:[a-z0-9]+:)?addressbook[\s/>]/i.test(b)) continue;
    const href = extractHrefs(b)[0];
    if (!href) continue;
    const nameM = b.match(/<(?:[a-z0-9]+:)?displayname[^>]*>([^<]*)<\/(?:[a-z0-9]+:)?displayname>/i);
    out.push({ url: new URL(href, baseUrl).toString(), name: nameM?.[1]?.trim() || "Contacts" });
  }
  return out;
}

// href → { etag, vcard } pairs from an addressbook-query REPORT.
function extractCards(xml: string): { href: string; etag: string | null; vcard: string }[] {
  const out: { href: string; etag: string | null; vcard: string }[] = [];
  for (const b of xml.split(/<\/(?:[a-z0-9]+:)?response>/i)) {
    const href = extractHrefs(b)[0];
    const dataM = b.match(/<(?:[a-z0-9]+:)?address-data[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?address-data>/i);
    if (!href || !dataM) continue;
    const etagM = b.match(/<(?:[a-z0-9]+:)?getetag[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?getetag>/i);
    const vcard = dataM[1]!
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#13;/g, "")
      .replace(/&amp;/g, "&");
    out.push({ href, etag: etagM?.[1]?.trim() ?? null, vcard });
  }
  return out;
}

export type CarddavDiscovered = { homeUrl: string; addressbooks: { url: string; name: string }[] };

export async function discoverContacts(server: string, user: string, pass: string): Promise<CarddavDiscovered> {
  const a = auth(user, pass);
  const root = server.replace(/\/+$/, "") + "/";
  const p1 = await dav(
    "PROPFIND",
    root,
    a,
    "0",
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  );
  if (p1.status === 401 || p1.status === 403) {
    throw new Error("iCloud rejected the Apple ID or app-specific password.");
  }
  if (p1.status >= 400) throw new Error(`CardDAV discovery failed (HTTP ${p1.status}).`);
  const principalHref = extractHrefs(p1.text).find((h) => /principal/i.test(h)) ?? extractHrefs(p1.text)[0];
  if (!principalHref) throw new Error("Couldn't locate the CardDAV principal.");

  const p2 = await dav(
    "PROPFIND",
    new URL(principalHref, p1.finalUrl).toString(),
    a,
    "0",
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:addressbook-home-set/></d:prop></d:propfind>`,
  );
  const homeHref = extractHrefs(p2.text)[0];
  if (!homeHref) throw new Error("Couldn't locate the addressbook home.");
  const homeUrl = new URL(homeHref, p2.finalUrl).toString();

  const p3 = await dav(
    "PROPFIND",
    homeUrl,
    a,
    "1",
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>`,
  );
  const addressbooks = extractAddressbooks(p3.text, p3.finalUrl);
  if (!addressbooks.length) throw new Error("Connected, but found no address books.");
  return { homeUrl, addressbooks };
}

async function fetchCards(bookUrl: string, authz: string) {
  const body = `<?xml version="1.0" encoding="utf-8"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><card:address-data/></d:prop></card:addressbook-query>`;
  const res = await dav("REPORT", bookUrl, authz, "1", body);
  if (res.status >= 400) return [];
  return extractCards(res.text);
}

const substantive = (c: ParsedContact) => c.emails.length > 0 || c.phones.length > 0 || !!c.org;

export async function syncContactsAccount(acct: Account): Promise<{ pending: number; enriched: number }> {
  const sb = supabaseAdmin();
  const a = auth(acct.username, decryptSecret(acct.password_enc));

  // Existing link/inbox rows for this account.
  const { data: linkRows } = await sb
    .from("carddav_contacts")
    .select("id,remote_uid,etag,status,entity_id")
    .eq("account_id", acct.id)
    .limit(5000);
  const byUid = new Map(((linkRows ?? []) as any[]).map((r) => [r.remote_uid, r]));

  // Pull every card from every book.
  const cards: { uid: string; etag: string | null; contact: ParsedContact }[] = [];
  for (const book of acct.addressbooks ?? []) {
    for (const c of await fetchCards(book.url, a)) {
      const parsed = parseVcf(c.vcard)[0];
      if (!parsed) continue;
      cards.push({ uid: parsed.uid || c.href, etag: c.etag, contact: parsed });
    }
  }

  let pending = 0;
  let enriched = 0;
  const fresh = cards.filter((c) => !byUid.has(c.uid));
  const known = cards.filter((c) => byUid.has(c.uid));

  // NEW uids: match against the CRM; matches auto-enrich, unknowns go to inbox.
  if (fresh.length) {
    const decisions = await previewImport(acct.user_id, fresh.map((f) => f.contact));
    for (let i = 0; i < fresh.length; i++) {
      const f = fresh[i]!;
      const d = decisions[i]!;
      if (d.decision === "merge" && d.matchId) {
        await commitImport(acct.user_id, [
          {
            name: f.contact.name,
            org: f.contact.org,
            title: f.contact.title,
            emails: f.contact.emails,
            phones: f.contact.phones,
            bday: f.contact.bday,
            matchId: d.matchId,
          },
        ]);
        enriched++;
        await sb.from("carddav_contacts").insert({
          user_id: acct.user_id,
          account_id: acct.id,
          remote_uid: f.uid,
          etag: f.etag,
          name: f.contact.name,
          payload: f.contact as any,
          status: "linked",
          entity_id: d.matchId,
        });
      } else {
        const status = substantive(f.contact) ? "pending" : "dismissed";
        if (status === "pending") pending++;
        await sb.from("carddav_contacts").insert({
          user_id: acct.user_id,
          account_id: acct.id,
          remote_uid: f.uid,
          etag: f.etag,
          name: f.contact.name,
          payload: f.contact as any,
          status,
        });
      }
    }
  }

  // KNOWN uids: on etag change, refresh payload; linked people re-enrich.
  for (const k of known) {
    const row = byUid.get(k.uid)!;
    if (row.etag === k.etag) continue;
    if (row.status === "linked" && row.entity_id) {
      await commitImport(acct.user_id, [
        {
          name: k.contact.name,
          org: k.contact.org,
          title: k.contact.title,
          emails: k.contact.emails,
          phones: k.contact.phones,
          bday: k.contact.bday,
          matchId: row.entity_id,
        },
      ]);
      enriched++;
    }
    await sb
      .from("carddav_contacts")
      .update({ etag: k.etag, name: k.contact.name, payload: k.contact as any, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  const { count: pendTotal } = await sb
    .from("carddav_contacts")
    .select("id", { count: "exact", head: true })
    .eq("account_id", acct.id)
    .eq("status", "pending");
  await sb
    .from("carddav_accounts")
    .update({
      last_synced_at: new Date().toISOString(),
      last_status: `ok · ${cards.length} contacts · ${pendTotal ?? 0} awaiting review`,
    })
    .eq("id", acct.id);
  return { pending, enriched };
}

export async function connectCarddav(
  userId: string,
  username: string,
  password: string,
  server: string = ICLOUD_CONTACTS,
): Promise<{ addressbooks: number; pending: number; enriched: number }> {
  const d = await discoverContacts(server, username, password); // throws on bad creds
  const sb = supabaseAdmin();
  const row = {
    user_id: userId,
    server,
    username,
    password_enc: encryptSecret(password),
    home_url: d.homeUrl,
    addressbooks: d.addressbooks,
    active: true,
  };
  const { data: existing } = await sb
    .from("carddav_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("username", username)
    .maybeSingle();
  let id = existing?.id as string | undefined;
  if (id) await sb.from("carddav_accounts").update(row).eq("id", id);
  else {
    const { data, error } = await sb.from("carddav_accounts").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }
  const r = await syncContactsAccount({ id: id!, ...row });
  return { addressbooks: d.addressbooks.length, ...r };
}

// One-tap connect using the calendar's stored iCloud credential.
export async function connectUsingCalendarAccount(userId: string) {
  const { data } = await supabaseAdmin()
    .from("caldav_accounts")
    .select("username,password_enc,server")
    .eq("user_id", userId)
    .eq("active", true)
    .ilike("server", "%icloud%")
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No connected iCloud calendar account to reuse.");
  return connectCarddav(userId, data.username as string, decryptSecret(data.password_enc as string));
}

// Tick entry: refresh stale accounts (> 30 min).
export async function syncCarddavContacts(userId: string): Promise<{ accounts: number; enriched: number }> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - SYNC_INTERVAL_MS).toISOString();
  const { data } = await sb.from("carddav_accounts").select("*").eq("user_id", userId).eq("active", true);
  let n = 0;
  let enriched = 0;
  for (const a of (data ?? []) as any[]) {
    if (a.last_synced_at && a.last_synced_at > cutoff) continue;
    try {
      const r = await syncContactsAccount(a);
      enriched += r.enriched;
      n++;
    } catch (e: any) {
      await sb
        .from("carddav_accounts")
        .update({ last_status: `err: ${String(e?.message ?? e).slice(0, 80)}` })
        .eq("id", a.id);
    }
  }
  return { accounts: n, enriched };
}
