"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import type { Goal } from "@/lib/dashboard/goals";

// One goal: title, progress (done/total + bar), its linked tasks, and an inline
// "+ Add task" that creates a task already linked to this goal (so daily work
// rolls up). The new task still gets the agent's follow-up logic.
export function GoalCard({ goal }: { goal: Goal }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const pct = goal.total ? Math.round((goal.done / goal.total) * 100) : 0;

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, goal_id: goal.id }),
      });
      setTitle("");
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="m-0 text-[15px] font-bold text-inkstrong">{goal.title}</h3>
        <span className="shrink-0 font-mono text-[11px] text-ink3">
          {goal.done}/{goal.total}
        </span>
      </div>
      {goal.body && <p className="m-0 mt-1 text-[12.5px] leading-normal text-ink2">{goal.body}</p>}

      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line2">
        <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-2.5">
        {goal.tasks.length ? (
          goal.tasks.map((t) => {
            const m = t.area ? areaMeta(t.area) : null;
            const done = t.status === "done";
            return (
              <div key={t.id} className="flex items-center gap-2 border-t border-line2 py-1.5 text-[13px]">
                <span className={done ? "text-good" : "text-inkfaint"}>{done ? "✓" : "○"}</span>
                <button
                  type="button"
                  onClick={() => router.push(`${pathname}?task=${t.id}`)}
                  title="Open task details"
                  className={`min-w-0 flex-1 truncate text-left hover:underline ${done ? "text-ink3 line-through" : "text-inkstrong"}`}
                >
                  {t.title}
                </button>
                {m && (
                  <span style={{ color: m.color }} className="shrink-0 text-[10px] font-semibold">
                    {m.label}
                  </span>
                )}
                {!done && t.dueIso && <TaskTimer dueIso={t.dueIso} />}
              </div>
            );
          })
        ) : (
          <p className="m-0 py-1.5 text-[12px] text-inkfaint">No tasks linked yet.</p>
        )}
      </div>

      {adding ? (
        <form onSubmit={addTask} className="mt-2 flex items-center gap-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Task toward this goal…"
            className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink outline-none"
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-[#0C0D10] disabled:opacity-50"
          >
            {busy ? "…" : "Add"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="px-1.5 text-[12px] text-ink3">
            ✕
          </button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 text-[12px] font-semibold text-ink3 transition hover:text-accent">
          + Add task
        </button>
      )}
    </div>
  );
}
