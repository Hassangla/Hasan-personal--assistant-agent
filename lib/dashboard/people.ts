import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID } from "@/lib/config";
import { areaMeta } from "@/lib/areas";
import { taskState } from "@/lib/dashboard/queries";
import { firstEmailOf } from "@/lib/people/importer";

export type PeopleContact = {
  id: string;
  name: string;
  role: string;
  org: string;
  email: string;
  area: string | null;
  last: string;
  summary: string;
  stats: { emails: number; tasks: number; since: string };
  timeline: { when: string; text: string }[];
  related: { title: string; color: string; label: string }[];
};

function relTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "soon";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "1 week ago";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}
function sinceLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(new Date(iso)).replace(" ", " '");
}

export async function getPeopleData(): Promise<{ contacts: PeopleContact[]; pendingCount: number }> {
  const sb = supabaseAdmin();

  const [personRes, taskRes, emailRes, interRes, areaRes, pendingRes] = await Promise.all([
    sb.from("entities").select("id,name,metadata,created_at").eq("user_id", USER_ID).eq("kind", "person").limit(60),
    sb
      .from("tasks")
      .select("id,title,status,due_at,nudge_count,person_id,area_id")
      .eq("user_id", USER_ID)
      .not("person_id", "is", null)
      .limit(400),
    sb
      .from("emails")
      .select("id,subject,received_at,person_id,area_id")
      .eq("user_id", USER_ID)
      .not("person_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(400),
    sb
      .from("interactions")
      .select("id,summary,occurred_at,person_id")
      .eq("user_id", USER_ID)
      .not("person_id", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(400),
    sb.from("entities").select("id,name").eq("user_id", USER_ID).eq("kind", "area"),
    sb.from("confirmations").select("id", { count: "exact", head: true }).eq("user_id", USER_ID).eq("status", "pending"),
  ]);

  const areaById = new Map<string, string>();
  for (const a of (areaRes.data ?? []) as any[]) areaById.set(a.id, a.name);

  const tasks = (taskRes.data ?? []) as any[];
  const emails = (emailRes.data ?? []) as any[];
  const inters = (interRes.data ?? []) as any[];

  const byPersonTasks = new Map<string, any[]>();
  const byPersonEmails = new Map<string, any[]>();
  const byPersonInter = new Map<string, any[]>();
  const personArea = new Map<string, string>();
  const push = (map: Map<string, any[]>, key: string, val: any) => {
    const arr = map.get(key) ?? [];
    arr.push(val);
    map.set(key, arr);
  };
  for (const t of tasks) {
    push(byPersonTasks, t.person_id, t);
    if (t.area_id && !personArea.has(t.person_id)) {
      const n = areaById.get(t.area_id);
      if (n) personArea.set(t.person_id, n);
    }
  }
  for (const e of emails) {
    push(byPersonEmails, e.person_id, e);
    if (e.area_id && !personArea.has(e.person_id)) {
      const n = areaById.get(e.area_id);
      if (n) personArea.set(e.person_id, n);
    }
  }
  for (const it of inters) push(byPersonInter, it.person_id, it);

  const contacts: PeopleContact[] = ((personRes.data ?? []) as any[]).map((p) => {
    const md = p.metadata ?? {};
    const pTasks = byPersonTasks.get(p.id) ?? [];
    const pEmails = byPersonEmails.get(p.id) ?? [];
    const pInter = byPersonInter.get(p.id) ?? [];
    const area = personArea.get(p.id) ?? (md.area as string) ?? null;
    const role = (md.role as string) || (md.title as string) || "Contact";
    const org = (md.org as string) || (md.organization as string) || (area ?? "");

    // last-contact = newest of any signal
    const times = [
      ...pEmails.map((e) => e.received_at),
      ...pInter.map((i) => i.occurred_at),
    ].filter(Boolean) as string[];
    const lastIso = times.sort().slice(-1)[0] ?? p.created_at;

    // merged history timeline
    const timeline = [
      ...pInter.map((i) => ({ raw: i.occurred_at as string, text: (i.summary as string) || "Interaction logged." })),
      ...pEmails.map((e) => ({ raw: e.received_at as string, text: `Email: ${e.subject ?? "(no subject)"}` })),
    ]
      .filter((x) => x.raw)
      .sort((a, b) => b.raw.localeCompare(a.raw))
      .slice(0, 4)
      .map((x) => ({ when: relTime(x.raw), text: x.text }));

    const openTasks = pTasks.filter((t) => ["open", "reminded", "escalated", "snoozed"].includes(t.status));
    const related = openTasks.slice(0, 4).map((t) => {
      const s = taskState(t);
      return { title: t.title, color: s.color, label: s.label };
    });

    const summary =
      (md.summary as string) ||
      `${role}${org ? ` · ${org}` : ""}. ${
        pTasks.length || pEmails.length
          ? `${pEmails.length} email${pEmails.length === 1 ? "" : "s"} and ${openTasks.length} open item${
              openTasks.length === 1 ? "" : "s"
            } on record.`
          : "A contact the agent is tracking."
      }`;

    return {
      id: p.id,
      name: p.name,
      role,
      org,
      email: firstEmailOf(md), // decrypts emails_enc server-side; falls back to legacy md.email
      area,
      last: relTime(lastIso),
      summary,
      stats: { emails: pEmails.length, tasks: pTasks.length, since: sinceLabel(p.created_at) },
      timeline,
      related,
    };
  });

  // Most-recently-touched first.
  const order = (c: PeopleContact) => (c.timeline[0] ? 1 : 0);
  contacts.sort((a, b) => order(b) - order(a) || b.stats.emails - a.stats.emails);

  return { contacts, pendingCount: pendingRes.count ?? 0 };
}
