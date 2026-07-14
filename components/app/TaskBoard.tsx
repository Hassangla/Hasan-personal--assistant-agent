"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import { toast } from "@/components/app/Toast";
import type { TodayTask, DoneTask } from "@/lib/dashboard/queries";

// Trello-style board: To Do → In Progress → Done. Drag cards between lanes AND
// reorder them within a lane (a lime drop-line shows where they'll land); the
// order persists. ‹ › arrows do lane moves on touch devices. Dropping into
// Done completes the task; dragging back out reopens it.

type Stage = "todo" | "doing" | "done";
type Card = {
  id: string;
  title: string;
  area: string | null;
  dueIso: string | null;
  checklist: { done: number; total: number } | null;
  stage: Stage;
  pos: number;
  ord: number; // original priority order — the tie-break for never-dragged cards
};

const LANES: { key: Stage; label: string; hint: string; dot: string }[] = [
  { key: "todo", label: "To Do", hint: "queued", dot: "#F3B24C" },
  { key: "doing", label: "In Progress", hint: "underway", dot: "#5C8DF0" },
  { key: "done", label: "Done", hint: "recent", dot: "#43D3A2" },
];

type Override = { stage: Stage; pos: number };

export function TaskBoard({ tasks, done }: { tasks: TodayTask[]; done: DoneTask[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [moves, setMoves] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ lane: Stage; beforeId: string | null } | null>(null);

  const cards: Card[] = useMemo(() => {
    const open = tasks.map((t, i) => ({
      id: t.id,
      title: t.title,
      area: t.area,
      dueIso: t.dueIso,
      checklist: t.checklist ? { done: t.checklist.done, total: t.checklist.total } : null,
      stage: (t.stage ?? "todo") as Stage,
      pos: t.boardPos ?? 0,
      ord: i,
    }));
    const doneCards = done
      .filter((d) => !open.some((o) => o.id === d.id))
      .map((d, i) => ({
        id: d.id,
        title: d.title,
        area: d.area,
        dueIso: null,
        checklist: null,
        stage: "done" as Stage,
        pos: 0,
        ord: 10000 + i,
      }));
    return [...open, ...doneCards];
  }, [tasks, done]);

  const effStage = (c: Card): Stage => moves[c.id]?.stage ?? c.stage;
  const effPos = (c: Card): number => moves[c.id]?.pos ?? c.pos;
  const laneCards = (lane: Stage): Card[] =>
    cards.filter((c) => effStage(c) === lane).sort((a, b) => effPos(a) - effPos(b) || a.ord - b.ord);

  // Place `id` into `lane` before `beforeId` (null = end). Persists the new
  // lane order; a drop into Done routes through completion instead.
  async function place(id: string, lane: Stage, beforeId: string | null) {
    if (busy) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const fromDone = effStage(card) === "done";

    if (lane === "done") {
      setMoves((m) => ({ ...m, [id]: { stage: "done", pos: 0 } }));
      setBusy(true);
      try {
        const res = await fetch("/api/tasks/stage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ task_id: id, stage: "done" }),
        });
        if (!res.ok) throw new Error();
        toast("Task completed ✓");
        setTimeout(() => {
          setMoves({});
          router.refresh();
        }, 700);
      } catch {
        setMoves((m) => {
          const n = { ...m };
          delete n[id];
          return n;
        });
        toast("Couldn't move that — try again", "err");
      } finally {
        setBusy(false);
      }
      return;
    }

    // Reorder within / into a todo|doing lane.
    const dest = laneCards(lane).filter((c) => c.id !== id);
    let idx = beforeId ? dest.findIndex((c) => c.id === beforeId) : dest.length;
    if (idx < 0) idx = dest.length;
    const ordered = [...dest.slice(0, idx), card, ...dest.slice(idx)];
    const orderedIds = ordered.map((c) => c.id);

    const optimistic: Record<string, Override> = { ...moves };
    orderedIds.forEach((cid, k) => (optimistic[cid] = { stage: lane, pos: k }));
    setMoves(optimistic);
    setBusy(true);
    try {
      const res = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: lane, ordered_ids: orderedIds }),
      });
      if (!res.ok) throw new Error();
      if (fromDone) toast("Task reopened ↩");
      setTimeout(() => {
        setMoves({});
        router.refresh();
      }, 700);
    } catch {
      setMoves(moves); // revert
      toast("Couldn't reorder — try again", "err");
    } finally {
      setBusy(false);
    }
  }

  // Arrow buttons: append to the end of the neighbouring lane.
  function arrow(id: string, to: Stage) {
    place(id, to, null);
  }

  const dropLine = (lane: Stage, beforeId: string | null) =>
    dragId && dropAt?.lane === lane && dropAt.beforeId === beforeId ? (
      <div className="my-0.5 h-[2px] rounded-full bg-accent shadow-[0_0_8px_0_#C2F24C]" />
    ) : null;

  return (
    <div className="-mx-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {LANES.map((lane) => {
        const list = laneCards(lane.key);
        const active = dragId && dropAt?.lane === lane.key;
        return (
          <div
            key={lane.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragId) setDropAt({ lane: lane.key, beforeId: null }); // hovering blank area → end
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) place(dragId, lane.key, dropAt?.lane === lane.key ? dropAt.beforeId : null);
              setDragId(null);
              setDropAt(null);
            }}
            className={`rounded-[14px] border p-2.5 transition ${
              active ? "border-accent bg-[#C2F24C08]" : "border-line2 bg-cardalt"
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
            <div className="flex max-h-[430px] min-h-[60px] flex-col overflow-y-auto">
              {list.length === 0 && !active && (
                <div className="rounded-[10px] border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-inkfaint">
                  {lane.key === "doing" ? "Drag a task here when you start it" : "Nothing here"}
                </div>
              )}
              {list.map((c) => {
                const m = c.area ? areaMeta(c.area) : null;
                const isDone = c.stage === "done";
                return (
                  <div key={c.id}>
                    {dropLine(lane.key, c.id)}
                    <div
                      draggable={!busy}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/task-id", c.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(c.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropAt(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!dragId || dragId === c.id) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > r.top + r.height / 2;
                        const idsInLane = list.map((x) => x.id);
                        const nextId = idsInLane[idsInLane.indexOf(c.id) + 1] ?? null;
                        setDropAt({ lane: lane.key, beforeId: after ? nextId : c.id });
                      }}
                      className={`mb-2 cursor-grab rounded-[11px] border border-line bg-card p-2.5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.5)] transition active:cursor-grabbing ${
                        dragId === c.id ? "opacity-40" : ""
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
                            style={{ color: m.color, background: m.color + "22" }}
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
                              onClick={() => arrow(c.id, lane.key === "done" ? "doing" : "todo")}
                              disabled={busy}
                              className="rounded-[6px] px-1.5 py-0.5 text-[11px] text-ink3 transition hover:bg-line2 hover:text-ink"
                            >
                              ‹
                            </button>
                          )}
                          {lane.key !== "done" && (
                            <button
                              type="button"
                              title={lane.key === "doing" ? "Complete ✓" : "Start → In Progress"}
                              onClick={() => arrow(c.id, lane.key === "todo" ? "doing" : "done")}
                              disabled={busy}
                              className={`rounded-[6px] px-1.5 py-0.5 text-[11px] transition hover:bg-line2 ${
                                lane.key === "doing" ? "text-good" : "text-ink3 hover:text-ink"
                              }`}
                            >
                              {lane.key === "doing" ? "✓" : "›"}
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {dropLine(lane.key, null)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
