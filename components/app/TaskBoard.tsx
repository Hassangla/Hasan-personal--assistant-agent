"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import { toast } from "@/components/app/Toast";
import type { TodayTask, DoneTask } from "@/lib/dashboard/queries";

// Trello-style board: To Do → In Progress → Done. Drag cards between lanes
// (desktop) or use the ‹ › arrows (works everywhere, incl. iPhone). Moving to
// Done completes the task for real; dragging back out reopens it.

type Stage = "todo" | "doing" | "done";
type Card = {
  id: string;
  title: string;
  area: string | null;
  dueIso: string | null;
  checklist: { done: number; total: number } | null;
  stage: Stage;
};

const LANES: { key: Stage; label: string; hint: string; dot: string }[] = [
  { key: "todo", label: "To Do", hint: "queued", dot: "#BC8638" },
  { key: "doing", label: "In Progress", hint: "underway", dot: "#3C6FB0" },
  { key: "done", label: "Done", hint: "recent", dot: "#2E8C61" },
];

export function TaskBoard({ tasks, done }: { tasks: TodayTask[]; done: DoneTask[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [moves, setMoves] = useState<Record<string, Stage>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Stage | null>(null);

  const cards: Card[] = useMemo(() => {
    const open = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      area: t.area,
      dueIso: t.dueIso,
      checklist: t.checklist ? { done: t.checklist.done, total: t.checklist.total } : null,
      stage: (moves[t.id] ?? t.stage) as Stage,
    }));
    const doneCards = done
      .filter((d) => !open.some((o) => o.id === d.id))
      .map((d) => ({
        id: d.id,
        title: d.title,
        area: d.area,
        dueIso: null,
        checklist: null,
        stage: (moves[d.id] ?? "done") as Stage,
      }));
    return [...open, ...doneCards];
  }, [tasks, done, moves]);

  async function move(id: string, to: Stage) {
    const from = cards.find((c) => c.id === id)?.stage;
    if (!from || from === to || busyId) return;
    setBusyId(id);
    setMoves((m) => ({ ...m, [id]: to })); // optimistic
    try {
      const res = await fetch("/api/tasks/stage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: id, stage: to }),
      });
      if (!res.ok) throw new Error();
      if (to === "done") toast("Task completed ✓");
      else if (from === "done") toast("Task reopened ↩");
      setTimeout(() => router.refresh(), 600);
    } catch {
      setMoves((m) => ({ ...m, [id]: from }));
      toast("Couldn't move that — try again", "err");
    } finally {
      setBusyId(null);
    }
  }

  function laneOf(stage: Stage): Card[] {
    return cards.filter((c) => c.stage === stage);
  }

  return (
    <div className="-mx-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {LANES.map((lane) => {
        const list = laneOf(lane.key);
        return (
          <div
            key={lane.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(lane.key);
            }}
            onDragLeave={() => setDragOver((v) => (v === lane.key ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData("text/task-id");
              if (id) move(id, lane.key);
            }}
            className={`rounded-[14px] border p-2.5 transition ${
              dragOver === lane.key ? "border-accent bg-[#C75F3F08]" : "border-line2 bg-cardalt"
            }`}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <span style={{ background: lane.dot }} className="h-2 w-2 rounded-full" />
              <span className="text-[13px] font-bold text-inkstrong">{lane.label}</span>
              <span className="font-mono text-[10px] text-inkfaint">{list.length}</span>
              <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.08em] text-inkfaint">
                {lane.hint}
              </span>
            </div>
            <div className="flex max-h-[430px] flex-col gap-2 overflow-y-auto">
              {list.length === 0 && (
                <div className="rounded-[10px] border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-inkfaint">
                  {lane.key === "doing" ? "Drag a task here when you start it" : "Nothing here"}
                </div>
              )}
              {list.map((c) => {
                const m = c.area ? areaMeta(c.area) : null;
                const isDone = c.stage === "done";
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/task-id", c.id)}
                    className={`cursor-grab rounded-[11px] border border-line bg-card p-2.5 shadow-[0_2px_8px_-4px_rgba(60,45,30,0.25)] active:cursor-grabbing ${
                      busyId === c.id ? "opacity-50" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`${pathname}?task=${c.id}`)}
                      className={`block w-full text-left text-[13px] font-medium leading-snug hover:underline ${
                        isDone ? "text-ink3 line-through" : "text-inkstrong"
                      }`}
                    >
                      {c.title}
                    </button>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {m && (
                        <span
                          style={{ color: m.color, background: m.color + "14" }}
                          className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold"
                        >
                          {m.label}
                        </span>
                      )}
                      {c.checklist && c.checklist.total > 0 && (
                        <span className="font-mono text-[10px] text-ink3">
                          ☑ {c.checklist.done}/{c.checklist.total}
                        </span>
                      )}
                      {!isDone && c.dueIso && <TaskTimer dueIso={c.dueIso} />}
                      <span className="ml-auto flex gap-0.5">
                        {lane.key !== "todo" && (
                          <button
                            type="button"
                            title={lane.key === "done" ? "Reopen → In Progress" : "Back to To Do"}
                            onClick={() => move(c.id, lane.key === "done" ? "doing" : "todo")}
                            disabled={!!busyId}
                            className="rounded-[6px] px-1.5 py-0.5 text-[11px] text-ink3 transition hover:bg-line2 hover:text-ink"
                          >
                            ‹
                          </button>
                        )}
                        {lane.key !== "done" && (
                          <button
                            type="button"
                            title={lane.key === "doing" ? "Complete ✓" : "Start → In Progress"}
                            onClick={() => move(c.id, lane.key === "todo" ? "doing" : "done")}
                            disabled={!!busyId}
                            className={`rounded-[6px] px-1.5 py-0.5 text-[11px] transition hover:bg-line2 ${
                              lane.key === "doing" ? "text-good hover:text-good" : "text-ink3 hover:text-ink"
                            }`}
                          >
                            {lane.key === "doing" ? "✓" : "›"}
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
