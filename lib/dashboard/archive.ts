import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID, USER_TIMEZONE } from "@/lib/config";

export type ArchiveItem = {
  id: string;
  title: string;
  status: "done" | "dropped";
  area: string | null;
  whenText: string;
  reason: string | null;
  delegatedTo: string | null;
};
export type ArchiveData = { done: ArchiveItem[]; dropped: ArchiveItem[]; pendingCount: number };

function fmt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: USER_TIMEZONE,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export async function getArchiveData(): Promise<ArchiveData> {
  const sb = supabaseAdmin();
  const [taskRes, reasonRes, areaRes, pendingRes] = await Promise.all([
    sb
      .from("tasks")
      .select("id,title,status,completed_at,updated_at,area_id,delegated_to")
      .eq("user_id", USER_ID)
      .in("status", ["done", "dropped"])
      .order("updated_at", { ascending: false })
      .limit(150),
    sb
      .from("audit_log")
      .select("resource_id,payload,created_at")
      .eq("user_id", USER_ID)
      .eq("resource_type", "task")
      .in("action", ["complete_task", "drop_task"])
      .order("created_at", { ascending: false })
      .limit(300),
    sb.from("entities").select("id,name").eq("user_id", USER_ID).eq("kind", "area"),
    sb.from("confirmations").select("id", { count: "exact", head: true }).eq("user_id", USER_ID).eq("status", "pending"),
  ]);

  const areaById = new Map<string, string>();
  for (const a of (areaRes.data ?? []) as any[]) areaById.set(a.id, a.name);

  const reasonByTask = new Map<string, string>();
  for (const r of (reasonRes.data ?? []) as any[]) {
    const id = r.resource_id as string | null;
    const reason = r.payload?.reason as string | undefined;
    if (id && reason && !reasonByTask.has(id)) reasonByTask.set(id, reason);
  }

  const items: ArchiveItem[] = ((taskRes.data ?? []) as any[]).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    area: t.area_id ? areaById.get(t.area_id) ?? null : null,
    whenText: fmt(t.completed_at ?? t.updated_at),
    reason: reasonByTask.get(t.id) ?? null,
    delegatedTo: t.delegated_to ?? null,
  }));

  return {
    done: items.filter((i) => i.status === "done"),
    dropped: items.filter((i) => i.status === "dropped"),
    pendingCount: pendingRes.count ?? 0,
  };
}
