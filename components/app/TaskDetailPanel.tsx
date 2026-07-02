"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";

type Detail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueIso: string | null;
  createdIso: string | null;
  area: string | null;
  goalId: string | null;
  goal: string | null;
  delegatedTo: string | null;
  nudgeCount: number;
  lastReason: string | null;
};
type Goal = { id: string; title: string; horizon: string };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

// Global slide-over opened via ?task=<id>. Click any task to see its full
// context (area · goal · deadline+timer · delegation) and act on it in place.
export function TaskDetailPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const taskId = params.get("task");

  const [d, setD] = useState<Detail | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [now, setNow] = useState(Date.now());

  function load() {
    if (!taskId) return;
    fetch(`/api/task?id=${encodeURIComponent(taskId)}`)
      .then((r) => r.json())
      .then((j) => {
        setD(j.task ?? null);
        setGoals(j.goals ?? []);
      })
      .catch(() => setD(null));
  }

  useEffect(() => {
    if (!taskId) {
      setD(null);
      return;
    }
    setLoading(true);
    setConfirmDel(false);
    fetch(`/api/task?id=${encodeURIComponent(taskId)}`)
      .then((r) => r.json())
      .then((j) => {
        setD(j.task ?? null);
        setGoals(j.goals ?? []);
      })
      .catch(() => setD(null))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!taskId) return null;

  const close = () => router.push(pathname);
  async function post(url: string, body: unknown) {
    setBusy(true);
    try {
      await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    await post("/api/tasks/complete", { task_id: taskId });
    router.push(pathname);
    router.refresh();
  }
  async function del() {
    await post("/api/tasks/delete", { task_id: taskId });
    router.push(pathname);
    router.refresh();
  }
  async function delegate() {
    const p = window.prompt("Delegate to whom?");
    if (!p || !p.trim()) return;
    await post("/api/tasks/delegate", { task_id: taskId, person: p.trim() });
    load();
    router.refresh();
  }
  async function takeBack() {
    await post("/api/tasks/delegate", { task_id: taskId, takeBack: true });
    load();
    router.refresh();
  }
  async function setGoal(gid: string) {
    await post("/api/tasks/link-goal", { task_id: taskId, goal_id: gid });
    load();
    router.refresh();
  }

  const m = d?.area ? areaMeta(d.area) : null;
  let pct = 0;
  let overdue = false;
  if (d?.dueIso) {
    const due = new Date(d.dueIso).getTime();
    overdue = due < now;
    if (d.createdIso) {
      const created = new Date(d.createdIso).getTime();
      if (due > created) pct = Math.min(100, Math.max(0, ((now - created) / (due - created)) * 100));
    }
  }

  const label = "mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25" onClick={close} />
      <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-line bg-page shadow-[0_0_60px_-15px_rgba(60,45,30,0.55)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-page/90 px-5 py-4 backdrop-blur">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">Task</span>
          <button onClick={close} className="text-[18px] leading-none text-ink3 transition hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {loading || !d ? (
          <div className="p-6 text-[14px] text-ink3">{loading ? "Loading…" : "Task not found."}</div>
        ) : (
          <div className="flex-1 px-5 py-5">
            <h2 className="m-0 text-[19px] font-bold leading-snug text-inkstrong">{d.title}</h2>
            {d.description && <p className="mt-1.5 text-[13px] leading-normal text-ink2">{d.description}</p>}

            <div className="mt-4 space-y-3.5">
              <div>
                <div className={label}>Deadline</div>
                {d.dueIso ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] text-inkstrong">{fmtDate(d.dueIso)}</span>
                      <TaskTimer dueIso={d.dueIso} />
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line2">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{ width: `${pct}%`, background: overdue ? "#C04A2E" : "#2E8C61" }}
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-inkfaint">created {fmtDate(d.createdIso)}</div>
                  </>
                ) : (
                  <span className="text-[13px] text-ink3">No deadline set.</span>
                )}
              </div>

              <div>
                <div className={label}>Area</div>
                {m ? (
                  <span
                    style={{ color: m.color, background: m.color + "14" }}
                    className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[12px] font-semibold"
                  >
                    <span style={{ background: m.color }} className="h-1.5 w-1.5 rounded-full" />
                    {m.label}
                  </span>
                ) : (
                  <span className="text-[13px] text-ink3">—</span>
                )}
              </div>

              <div>
                <div className={label}>Goal</div>
                <select
                  value={d.goalId ?? ""}
                  onChange={(e) => setGoal(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none"
                >
                  <option value="">— not linked —</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title} ({g.horizon})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-8">
                <div>
                  <div className={label}>Status</div>
                  <span className="text-[13px] capitalize text-inkstrong">
                    {d.delegatedTo ? `Delegated to ${d.delegatedTo}` : d.status}
                  </span>
                </div>
                {d.nudgeCount > 0 && (
                  <div>
                    <div className={label}>Nudges</div>
                    <span className="text-[13px] text-inkstrong">{d.nudgeCount}</span>
                  </div>
                )}
              </div>

              {d.lastReason && (
                <div>
                  <div className={label}>Last note</div>
                  <span className="text-[13px] text-ink2">{d.lastReason}</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <button
                onClick={complete}
                disabled={busy}
                className="rounded-[9px] bg-good px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(46,140,97,0.5)] disabled:opacity-50"
              >
                ✓ Complete
              </button>
              {d.delegatedTo ? (
                <button
                  onClick={takeBack}
                  disabled={busy}
                  className="rounded-[9px] border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-ink2 disabled:opacity-50"
                >
                  ↩ Take back
                </button>
              ) : (
                <button
                  onClick={delegate}
                  disabled={busy}
                  className="rounded-[9px] border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-ink2 disabled:opacity-50"
                >
                  → Delegate
                </button>
              )}
              {confirmDel ? (
                <button
                  onClick={del}
                  disabled={busy}
                  className="ml-auto rounded-[9px] bg-danger px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  Confirm delete
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDel(true)}
                  disabled={busy}
                  className="ml-auto rounded-[9px] px-3.5 py-2 text-[13px] font-semibold text-[#B26B5A] transition hover:text-danger"
                >
                  🗑 Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
