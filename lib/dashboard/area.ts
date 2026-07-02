import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID } from "@/lib/config";
import { areaBySlug, type AreaMeta } from "@/lib/areas";
import { taskState, type TaskState } from "@/lib/dashboard/queries";

export type AreaTaskRow = { id: string; title: string; state: TaskState; dueIso: string | null };
export type AreaPerson = { id: string; name: string; role: string };
export type AreaEmail = { id: string; from: string; subject: string; summary: string | null };
export type AreaData = {
  meta: AreaMeta;
  tasks: AreaTaskRow[];
  plans: { window: string; text: string }[];
  people: AreaPerson[];
  emails: AreaEmail[];
  pendingCount: number;
};

export async function getAreaData(slug: string): Promise<AreaData | null> {
  const meta = areaBySlug(slug);
  if (!meta) return null;
  const sb = supabaseAdmin();

  // Resolve the area entity id from its canonical name.
  const { data: areaEnt } = await sb
    .from("entities")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("kind", "area")
    .ilike("name", meta.canonical)
    .limit(1)
    .maybeSingle();
  const areaId = areaEnt?.id as string | undefined;

  const [taskRes, emailRes, planRes, pendingRes] = await Promise.all([
    areaId
      ? sb
          .from("tasks")
          .select("id,title,status,due_at,nudge_count,person_id,priority_score")
          .eq("user_id", USER_ID)
          .eq("area_id", areaId)
          .in("status", ["open", "reminded", "escalated", "snoozed"])
          .order("priority_score", { ascending: false })
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(50)
      : Promise.resolve({ data: [] as any[] }),
    areaId
      ? sb
          .from("emails")
          .select("id,from_name,from_email,subject,summary,person_id,received_at")
          .eq("user_id", USER_ID)
          .eq("area_id", areaId)
          .order("received_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] as any[] }),
    sb.from("plans").select("id,horizon,title").eq("user_id", USER_ID).eq("status", "active").limit(40),
    sb.from("confirmations").select("id", { count: "exact", head: true }).eq("user_id", USER_ID).eq("status", "pending"),
  ]);

  const taskRows = (taskRes.data ?? []) as any[];
  const emailRows = (emailRes.data ?? []) as any[];

  const tasks: AreaTaskRow[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    state: taskState(t),
    dueIso: t.due_at ?? null,
  }));

  // People linked to this area through one of its tasks or emails.
  const personIds = new Set<string>();
  for (const t of taskRows) if (t.person_id) personIds.add(t.person_id);
  for (const e of emailRows) if (e.person_id) personIds.add(e.person_id);
  let people: AreaPerson[] = [];
  if (personIds.size) {
    const { data: ents } = await sb
      .from("entities")
      .select("id,name,metadata")
      .eq("user_id", USER_ID)
      .in("id", [...personIds]);
    people = ((ents ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      role: (p.metadata?.role as string) || (p.metadata?.title as string) || "Contact",
    }));
  }

  // Plans carry no area column — match the area by name in the plan title.
  const WINDOWS: Record<string, string> = { short: "This week", medium: "This month", long: "This quarter" };
  const n1 = meta.label.toLowerCase();
  const n2 = meta.canonical.toLowerCase();
  const plans = ((planRes.data ?? []) as any[])
    .filter((p) => {
      const t = (p.title || "").toLowerCase();
      return t.includes(n1) || t.includes(n2);
    })
    .map((p) => ({ window: WINDOWS[p.horizon] ?? p.horizon, text: p.title }));

  const emails: AreaEmail[] = emailRows.map((e) => ({
    id: e.id,
    from: e.from_name || e.from_email || "unknown",
    subject: e.subject ?? "(no subject)",
    summary: e.summary ?? null,
  }));

  return { meta, tasks, plans, people, emails, pendingCount: pendingRes.count ?? 0 };
}
