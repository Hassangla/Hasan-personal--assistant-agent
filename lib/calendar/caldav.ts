import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseIcs } from "@/lib/calendar/ics";
import { encryptSecret, decryptSecret } from "@/lib/calendar/crypto";

// Minimal CalDAV client, targeted at iCloud. Discovers the user's calendars and
// imports their events into `meetings`. XML is extracted with focused regexes —
// enough for iCloud's well-formed multistatus responses (validated by a test).

const UA = "PersonalAgent/1.0 (+calendar-sync)";
const PAST = 30 * 86400000;
const FUTURE = 365 * 86400000;

type Account = {
  id: string;
  user_id: string;
  server: string;
  username: string;
  password_enc: string;
  calendars: { url: string; name: string }[] | null;
};

function authHeader(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#13;/g, "")
    .replace(/&amp;/g, "&");
}

// All <...href>VALUE</...href> values (namespace-agnostic).
export function extractHrefs(xml: string): string[] {
  return [...xml.matchAll(/<(?:[a-z0-9]+:)?href[^>]*>([^<]+)<\/(?:[a-z0-9]+:)?href>/gi)].map((m) =>
    m[1]!.trim(),
  );
}

// VEVENT calendar-data blocks from a REPORT response.
export function extractCalendarData(xml: string): string[] {
  return [
    ...xml.matchAll(/<(?:[a-z0-9]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?calendar-data>/gi),
  ].map((m) => unescapeXml(m[1]!));
}

// Calendar collections (url + name) from a Depth:1 PROPFIND on the home set.
export function extractCalendars(xml: string, baseUrl: string): { url: string; name: string }[] {
  const out: { url: string; name: string }[] = [];
  const blocks = xml.split(/<\/(?:[a-z0-9]+:)?response>/i);
  for (const b of blocks) {
    // resourcetype must contain <calendar/> and it must support VEVENT
    if (!/<(?:[a-z0-9]+:)?calendar[\s/>]/i.test(b)) continue;
    if (!/VEVENT/i.test(b)) continue;
    const href = extractHrefs(b)[0];
    if (!href) continue;
    const nameM = b.match(/<(?:[a-z0-9]+:)?displayname[^>]*>([^<]*)<\/(?:[a-z0-9]+:)?displayname>/i);
    out.push({ url: new URL(href, baseUrl).toString(), name: nameM ? unescapeXml(nameM[1]!.trim()) : "Calendar" });
  }
  return out;
}

async function propfind(url: string, auth: string, depth: "0" | "1", body: string) {
  const res = await fetch(url, {
    method: "PROPFIND",
    headers: {
      authorization: auth,
      depth,
      "content-type": "application/xml; charset=utf-8",
      "user-agent": UA,
    },
    body,
    redirect: "follow",
  });
  return { status: res.status, text: await res.text(), finalUrl: res.url };
}

export type Discovered = { homeUrl: string; calendars: { url: string; name: string }[] };

// Validate credentials + discover the calendar home and calendars.
export async function discover(server: string, user: string, pass: string): Promise<Discovered> {
  const auth = authHeader(user, pass);
  const root = server.replace(/\/+$/, "") + "/";

  const p1 = await propfind(
    root,
    auth,
    "0",
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  );
  if (p1.status === 401 || p1.status === 403) {
    throw new Error("iCloud rejected the Apple ID or app-specific password — double-check both (the password looks like xxxx-xxxx-xxxx-xxxx).");
  }
  if (p1.status >= 400) throw new Error(`CalDAV discovery failed (HTTP ${p1.status}).`);
  const principalHref = extractHrefs(p1.text).find((h) => /principal/i.test(h)) ?? extractHrefs(p1.text)[0];
  if (!principalHref) throw new Error("Couldn't locate the CalDAV principal.");
  const principalUrl = new URL(principalHref, p1.finalUrl).toString();

  const p2 = await propfind(
    principalUrl,
    auth,
    "0",
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
  );
  // Take the href from INSIDE calendar-home-set — the multistatus also lists
  // the principal's own href first (same trap as the CardDAV discovery).
  const homeM = p2.text.match(
    /<(?:[a-z0-9]+:)?calendar-home-set[^>]*>[\s\S]*?<(?:[a-z0-9]+:)?href[^>]*>([^<]+)<\/(?:[a-z0-9]+:)?href>/i,
  );
  const homeHref = homeM?.[1]?.trim() ?? extractHrefs(p2.text).find((h) => h !== principalHref);
  if (!homeHref) throw new Error("Couldn't locate the calendar home.");
  const homeUrl = new URL(homeHref, p2.finalUrl).toString();

  const p3 = await propfind(
    homeUrl,
    auth,
    "1",
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`,
  );
  const calendars = extractCalendars(p3.text, p3.finalUrl);
  if (!calendars.length) throw new Error("Connected, but found no event calendars to import.");
  return { homeUrl, calendars };
}

function icsTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function reportEvents(calUrl: string, auth: string): Promise<string[]> {
  const start = icsTime(new Date(Date.now() - PAST));
  const end = icsTime(new Date(Date.now() + FUTURE));
  const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${start}" end="${end}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const res = await fetch(calUrl, {
    method: "REPORT",
    headers: { authorization: auth, depth: "1", "content-type": "application/xml; charset=utf-8", "user-agent": UA },
    body,
    redirect: "follow",
  });
  if (!res.ok) return [];
  return extractCalendarData(await res.text());
}

async function syncAccount(acct: Account): Promise<number> {
  const sb = supabaseAdmin();
  const auth = authHeader(acct.username, decryptSecret(acct.password_enc));
  const now = Date.now();
  let count = 0;

  for (const cal of acct.calendars ?? []) {
    let datas: string[];
    try {
      datas = await reportEvents(cal.url, auth);
    } catch {
      continue;
    }
    for (const ics of datas) {
      for (const ev of parseIcs(ics)) {
        if (/@personal-agent(#|$)/.test(ev.uid)) continue; // de-echo our own feed
        const startMs = new Date(ev.startIso).getTime();
        if (Number.isNaN(startMs) || startMs < now - PAST || startMs > now + FUTURE) continue;
        const extUid = `caldav:${acct.id}:${ev.uid}`;
        if (ev.cancelled) {
          await sb
            .from("meetings")
            .update({ status: "cancelled", next_reminder_at: null })
            .eq("user_id", acct.user_id)
            .eq("external_uid", extUid);
          continue;
        }
        const { data: existing } = await sb
          .from("meetings")
          .select("id, starts_at")
          .eq("user_id", acct.user_id)
          .eq("external_uid", extUid)
          .maybeSingle();
        const remindAt = new Date(startMs - 30 * 60000).toISOString();
        const base = {
          title: ev.title,
          location: ev.location,
          notes: ev.description,
          starts_at: ev.startIso,
          ends_at: ev.endIso,
          all_day: ev.allDay,
          status: "scheduled" as const,
        };
        if (existing) {
          const patch: Record<string, unknown> = { ...base };
          if (existing.starts_at !== ev.startIso) {
            patch.next_reminder_at = remindAt;
            patch.reminded = false;
          }
          await sb.from("meetings").update(patch).eq("id", existing.id);
        } else {
          const { error } = await sb.from("meetings").insert({
            user_id: acct.user_id,
            ...base,
            external_source: "icloud",
            external_uid: extUid,
            remind_minutes_before: 30,
            next_reminder_at: remindAt,
          });
          if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
        }
        count++;
      }
    }
  }

  await sb
    .from("caldav_accounts")
    .update({ last_synced_at: new Date().toISOString(), last_status: `ok · ${count} events` })
    .eq("id", acct.id);
  return count;
}

// Validate + store credentials, then do an initial import.
export async function connectCaldav(
  userId: string,
  server: string,
  user: string,
  pass: string,
): Promise<{ calendars: number; imported: number }> {
  const d = await discover(server, user, pass); // throws on bad creds
  const sb = supabaseAdmin();
  const row = {
    user_id: userId,
    server,
    username: user,
    password_enc: encryptSecret(pass),
    home_url: d.homeUrl,
    calendars: d.calendars,
    active: true,
  };
  const { data: existing } = await sb
    .from("caldav_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("username", user)
    .maybeSingle();
  let id = existing?.id as string | undefined;
  if (id) {
    await sb.from("caldav_accounts").update(row).eq("id", id);
  } else {
    const { data, error } = await sb.from("caldav_accounts").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }
  const imported = await syncAccount({ id: id!, ...row });
  return { calendars: d.calendars.length, imported };
}

// Tick entry: re-sync accounts that are new or stale (> 10 min).
export async function syncCaldavAccounts(userId: string): Promise<{ accounts: number; imported: number }> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await sb.from("caldav_accounts").select("*").eq("user_id", userId).eq("active", true);
  let imported = 0;
  let n = 0;
  for (const a of (data ?? []) as any[]) {
    if (a.last_synced_at && a.last_synced_at > cutoff) continue;
    try {
      imported += await syncAccount(a);
      n++;
    } catch (e: any) {
      await sb
        .from("caldav_accounts")
        .update({ last_status: `err: ${String(e?.message ?? e).slice(0, 80)}` })
        .eq("id", a.id);
    }
  }
  return { accounts: n, imported };
}

export type CaldavAccount = { id: string; username: string; lastStatus: string | null };

export async function caldavAccounts(userId: string): Promise<CaldavAccount[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("caldav_accounts")
    .select("id, username, last_status")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: true });
  return ((data ?? []) as any[]).map((a) => ({ id: a.id, username: a.username, lastStatus: a.last_status ?? null }));
}

// Disconnect one account (by id) or all: deactivate + drop its imported events.
export async function disconnectCaldav(userId: string, accountId?: string): Promise<void> {
  const sb = supabaseAdmin();
  let q = sb.from("caldav_accounts").select("id").eq("user_id", userId).eq("active", true);
  if (accountId) q = q.eq("id", accountId);
  const { data } = await q;
  for (const a of (data ?? []) as any[]) {
    await sb.from("meetings").delete().eq("user_id", userId).like("external_uid", `caldav:${a.id}:%`);
    await sb.from("caldav_accounts").update({ active: false }).eq("id", a.id);
  }
}
