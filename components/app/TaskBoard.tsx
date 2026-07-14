"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import { toast } from "@/components/app/Toast";
import type { TodayTask, DoneTask } from "@/lib/dashboard/queries";

// Trello-style board with POINTER-based drag (works with a finger on
// iPhone/iPad and with a mouse). Grab a card by its ⠿ grip and drag it to
// reorder within a lane or move it across lanes; a lime drop-line shows where
// it lands, and the order persists. ‹ › arrows remain for quick lane moves.
// Dropping into Done completes the task; dragging out of Done reopens it.

type Stage = "todo" | "doing" | "done";
type Card = {
  id: string;
  title: string;
  area: string | null;
  dueIso: string | null;
  checklist: { done: number; total: number } | null;
  stage: Stage;
  pos: number;
  ord: number;
};

const LANES: { key: Stage; label: string; hint: string; dot: string }[] = [
  { key: "todo", label: "To Do", hint: "queued", dot: "#F3B24C" },
  { key: "doing", label: "In Progress", hint: "underway", dot: "#5C8DF0" },
  { key: "done", label: "Done", hint: "recent", dot: "#43D3A2" },
];

type Override = { stage: Stage; pos: number };
type Drop = { lane: Stage; beforeId: string | null };

export function TaskBoard({ tasks, done }: { tasks: TodayTask[]; done: DoneTask[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [moves, setMoves] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);

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

  async function place(id: string, lane: Stage, beforeId: string | null) {
    if (busy) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const fromDone = effStage(card) === "done";
    if (lane === effStage(card) && lane !== "done") {
      // reorder within same lane — proceed (may be a no-op the server tolerates)
    }

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

    const dest = laneCards(lane).filter((c) => c.id !== id);
    let idx = beforeId ? dest.findIndex((c) => c.id === beforeId) : dest.length;
    if (idx < 0) idx = dest.length;
    const orderedIds = [...dest.slice(0, idx), card, ...dest.slice(idx)].map((c) => c.id);

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
      setMoves(moves);
      toast("Couldn't reorder — try again", "err");
    } finally {
      setBusy(false);
    }
  }

  function arrow(id: string, to: Stage) {
    place(id, to, null);
  }

  // ——— pointer drag ———
  function computeDrop(x: number, y: number): Drop | null {
    const el = document.elementFromPoint(x, y);
    const laneEl = el?.closest("[data-lane]") as HTMLElement | null;
    if (!laneEl || !rootRef.current?.contains(laneEl)) return null;
    const lane = laneEl.getAttribute("data-lane") as Stage;
    const cardEls = Array.from(laneEl.querySelectorAll<HTMLElement>("[data-card-id]"));
    for (const ce of cardEls) {
      const cid = ce.getAttribute("data-card-id")!;
      if (cid === dragId) continue;
      const r = ce.getBoundingClientRect();
      if (y < r.top + r.height / 2) return { lane, beforeId: cid };
    }
    return { lane, beforeId: null };
  }

  function onGripDown(e: React.PointerEvent, card: Card) {
    if (busy) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(card.id);
    setGhost({ x: e.clientX, y: e.clientY, title: card.title });
    setDrop({ lane: effStage(card), beforeId: null });
  }
  function onGripMove(e: React.PointerEvent) {
    if (!dragId) return;
    e.preventDefault();
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    const d = computeDrop(e.clientX, e.clientY);
    if (d) setDrop(d);
  }
  function onGripUp(e: React.PointerEvent) {
    if (!dragId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const target = drop ?? computeDrop(e.clientX, e.clientY);
    const id = dragId;
    setDragId(null);
    setGhost(null);
    setDrop(null);
    if (target) place(id, target.lane, target.beforeId);
  }

  const dropLine = (lane: Stage, beforeId: string | null) =>
    dragId && drop?.lane === lane && drop.beforeId === beforeId ? (
      <div className="mx-0.5 my-1 h-[3px] rounded-full bg-accent shadow-[0_0_10px_0_#C2F24C]" />
    ) : null;

  return (
    <div ref={rootRef} className="-mx-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {LANES.map((lane) => {
        const list = laneCards(lane.key);
        const active = dragId && drop?.lane === lane.key;
        return (
          <div
            key={lane.key}
            data-lane={lane.key}
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
            <div className="flex max-h-[440px] min-h-[64px] flex-col overflow-y-auto">
              {list.length === 0 && !active && (
                <div className="rounded-[10px] border border-dashed border-line px-3 py-5 text-center text-[11.5px] text-inkfaint">
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
                      data-card-id={c.id}
                      className={`mb-2 flex items-start gap-2 rounded-[11px] border border-line bg-card p-2.5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.5)] transition ${
                        dragId === c.id ? "opacity-30" : ""
                      }`}
                    >
                      {/* grip — the only drag surface, so scrolling the lane still works */}
                      <button
                        type="button"
                        onPointerDown={(e) => onGripDown(e, c)}
                        onPointerMove={onGripMove}
                        onPointerUp={onGripUp}
                        onPointerCancel={onGripUp}
                        title="Drag to reorder"
                        aria-label="Drag to reorder"
                        style={{ touchAction: "none" }}
                        className="mt-0.5 shrink-0 cursor-grab select-none px-0.5 text-[15px] leading-none text-ink3 hover:text-ink active:cursor-grabbing"
                      >
                        ⠿
                      </button>
                      <div className="min-w-0 flex-1">
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
                                className="rounded-[6px] px-1.5 py-0.5 text-[13px] leading-none text-ink3 transition hover:bg-line2 hover:text-ink"
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
                                className={`rounded-[6px] px-1.5 py-0.5 text-[13px] leading-none transition hover:bg-line2 ${
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
                  </div>
                );
              })}
              {dropLine(lane.key, null)}
            </div>
          </div>
        );
      })}

      {/* floating ghost that follows the finger/cursor */}
      {ghost && (
        <div
          className="pointer-events-none fixed z-[60] max-w-[220px] truncate rounded-[10px] border border-accent bg-card px-3 py-2 text-[12.5px] font-semibold text-ink shadow-[0_10px_30px_-8px_rgba(0,0,0,0.7)]"
          style={{ left: ghost.x + 12, top: ghost.y + 12 }}
        >
          {ghost.title}
        </div>
      )}
    </div>
  );
}
