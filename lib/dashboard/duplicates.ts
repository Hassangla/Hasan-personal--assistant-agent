import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID } from "@/lib/config";

export type DupTaskGroup = { key: string; title: string; ids: string[]; count: number };
export type DupPersonGroup = { key: string; name: string; ids: string[]; count: number };
export type DuplicatesData = { tasks: DupTaskGroup[]; people: DupPersonGroup[] };

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Detect likely duplicates: open tasks with the same normalized title, and
// people with the same email (or, failing that, the same normalized name).
// Surfaced for review — the user confirms the merge/removal.
export async function getDuplicates(): Promise<DuplicatesData> {
  const sb = supabaseAdmin();
  const [taskRes, personRes] = await Promise.all([
    sb
      .from("tasks")
      .select("id,title,created_at,status")
      .eq("user_id", USER_ID)
      .in("status", ["open", "reminded", "escalated", "snoozed"])
      .limit(1500),
    sb.from("entities").select("id,name,metadata,created_at").eq("user_id", USER_ID).eq("kind", "person").limit(800),
  ]);

  const tmap = new Map<string, { title: string; rows: any[] }>();
  for (const t of (taskRes.data ?? []) as any[]) {
    const k = norm(t.title);
    if (!k) continue;
    const e = tmap.get(k) ?? { title: t.title, rows: [] as any[] };
    e.rows.push(t);
    tmap.set(k, e);
  }
  const tasks: DupTaskGroup[] = [...tmap.values()]
    .filter((v) => v.rows.length > 1)
    .map((v) => {
      const sorted = v.rows.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
      return { key: norm(v.title), title: v.title, ids: sorted.map((r) => r.id), count: sorted.length };
    });

  const pmap = new Map<string, { name: string; rows: any[] }>();
  for (const p of (personRes.data ?? []) as any[]) {
    const email = norm((p.metadata?.email as string) || "");
    const k = email || norm(p.name);
    if (!k) continue;
    const e = pmap.get(k) ?? { name: p.name, rows: [] as any[] };
    e.rows.push(p);
    pmap.set(k, e);
  }
  const people: DupPersonGroup[] = [...pmap.values()]
    .filter((v) => v.rows.length > 1)
    .map((v) => {
      const sorted = v.rows.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
      return { key: norm(v.name), name: v.name, ids: sorted.map((r) => r.id), count: sorted.length };
    });

  return { tasks, people };
}
