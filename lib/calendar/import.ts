import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseIcs } from "@/lib/calendar/ics";

const DEFAULT_LEAD = 30; // minutes before an imported event to remind
const PAST_WINDOW = 7 * 86400000;
const FUTURE_WINDOW = 365 * 86400000;
const SYNC_INTERVAL_MS = 10 * 60 * 1000;

type Source = { id: string; user_id: string; url: string; label: string | null };

async function markSource(id: string, status: string): Promise<void> {
  await supabaseAdmin()
    .from("calendar_sources")
    .update({ last_synced_at: new Date().toISOString(), last_status: status })
    .eq("id", id);
}

// Fetch one source's feed and upsert its events into `meetings`.
export async function syncSource(src: Source): Promise<number> {
  const sb = supabaseAdmin();
  const url = src.url.replace(/^webcal:\/\//i, "https://");
  let text: string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "PersonalAgent/1.0 (+calendar-sync)" },
      redirect: "follow",
    });
    if (!res.ok) {
      await markSource(src.id, `http ${res.status}`);
      return 0;
    }
    text = await res.text();
  } catch (e: any) {
    await markSource(src.id, `fetch error: ${String(e?.message ?? e).slice(0, 80)}`);
    return 0;
  }

  const events = parseIcs(text);
  const now = Date.now();
  const label = src.label || "subscription";
  let count = 0;

  for (const ev of events) {
    const startMs = new Date(ev.startIso).getTime();
    if (Number.isNaN(startMs) || startMs < now - PAST_WINDOW || startMs > now + FUTURE_WINDOW) continue;
    const extUid = `${src.id}:${ev.uid}`;

    if (ev.cancelled) {
      await sb
        .from("meetings")
        .update({ status: "cancelled", next_reminder_at: null })
        .eq("user_id", src.user_id)
        .eq("external_uid", extUid);
      continue;
    }

    const { data: existing } = await sb
      .from("meetings")
      .select("id, starts_at")
      .eq("user_id", src.user_id)
      .eq("external_uid", extUid)
      .maybeSingle();

    const remindAt = new Date(startMs - DEFAULT_LEAD * 60000).toISOString();
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
      // Only re-arm the reminder if the event moved.
      if (existing.starts_at !== ev.startIso) {
        patch.next_reminder_at = remindAt;
        patch.reminded = false;
      }
      await sb.from("meetings").update(patch).eq("id", existing.id);
    } else {
      const { error } = await sb.from("meetings").insert({
        user_id: src.user_id,
        ...base,
        external_source: label,
        external_uid: extUid,
        remind_minutes_before: DEFAULT_LEAD,
        next_reminder_at: remindAt,
      });
      if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    }
    count++;
  }

  await markSource(src.id, `ok · ${count} events`);
  return count;
}

// Tick entry: sync sources that are new or stale (> SYNC_INTERVAL_MS old).
export async function importDueSources(userId: string): Promise<{ sources: number; imported: number }> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - SYNC_INTERVAL_MS).toISOString();
  const { data: sources } = await sb
    .from("calendar_sources")
    .select("id,user_id,url,label,last_synced_at")
    .eq("user_id", userId)
    .eq("active", true);
  let imported = 0;
  let n = 0;
  for (const s of (sources ?? []) as any[]) {
    if (s.last_synced_at && s.last_synced_at > cutoff) continue;
    try {
      imported += await syncSource(s);
      n++;
    } catch (e) {
      console.error("[import] sync failed:", e);
    }
  }
  return { sources: n, imported };
}

export type CalSource = { id: string; label: string | null; url: string; lastStatus: string | null };

// Linked ICS/webcal subscriptions, for display + management on the Calendar page.
export async function listCalendarSources(userId: string): Promise<CalSource[]> {
  const { data } = await supabaseAdmin()
    .from("calendar_sources")
    .select("id,label,url,last_status,created_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: true });
  return ((data ?? []) as any[]).map((s) => ({
    id: s.id,
    label: s.label ?? null,
    url: s.url,
    lastStatus: s.last_status ?? null,
  }));
}

// Unlink one ICS source: deactivate it and drop the events it imported.
export async function removeCalendarSource(userId: string, id: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("meetings").delete().eq("user_id", userId).like("external_uid", `${id}:%`);
  await sb.from("calendar_sources").update({ active: false }).eq("user_id", userId).eq("id", id);
}

// Register a source (dedup by URL) and do an initial sync.
export async function addCalendarSource(
  userId: string,
  url: string,
  label?: string,
): Promise<{ id: string; imported: number }> {
  const sb = supabaseAdmin();
  const clean = url.trim();
  if (!/^(https?|webcal):\/\//i.test(clean)) throw new Error("That doesn't look like a calendar URL (need http(s):// or webcal://).");

  const { data: existing } = await sb
    .from("calendar_sources")
    .select("id")
    .eq("user_id", userId)
    .eq("url", clean)
    .maybeSingle();

  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await sb
      .from("calendar_sources")
      .insert({ user_id: userId, url: clean, label: label ?? null, active: true })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  } else {
    await sb.from("calendar_sources").update({ active: true, label: label ?? null }).eq("id", id);
  }

  const imported = await syncSource({ id, user_id: userId, url: clean, label: label ?? null });
  return { id, imported };
}
