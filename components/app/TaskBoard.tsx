"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import { LabelChips } from "@/components/app/LabelPicker";
import { labelMeta } from "@/lib/labels";
import { BoardAddCard } from "@/components/app/BoardAddCard";
import { toast } from "@/components/app/Toast";
import type { TodayTask, DoneTask } from "@/lib/dashboard/queries";
import type { BoardList } from "@/lib/dashboard/board";

// Trello-style board with fully customizable lists (columns): add, rename,
// recolor, reorder, delete. Cards drag between lists and reorder within them
// (pointer-based, works on touch via the ⠿ grip) and the order persists.
// Dropping a card into the "done" list completes it; the ✓ button completes in
// place. Lists scroll horizontally.

const PALETTE = ["#F3B24C", "#5C8DF0", "#43D3A2", "#FF6A45", "#B48FF0", "#D065A0", "#2E9B8F", "#8B9099"];

type Card = {
  id: string;
  title: string;
  area: string | null;
  dueIso: string | null;
  checklist: { done: number; total: number } | null;
  labels: string[];
  listId: string | null;
  pos: number;
  ord: number;
  completed: boolean;
};
type Override = { listId: string; pos: number };
type Drop = { listId: string; beforeId: string | null };

export function TaskBoard({
  tasks,
  done,
  lists,
  fill = false,
}: {
  tasks: TodayTask[];
  done: DoneTask[];
  lists: BoardList[];
  fill?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [moves, setMoves] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);

  // list-management UI state
  const [editList, setEditList] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState(""); // in-board search
  const [listDragId, setListDragId] = useState<string | null>(null); // column being dragged
  const [listDropId, setListDropId] = useState<string | null>(null); // insert before this list (null = end)

  // Lists live in local state so edits (rename / recolor / reorder / add /
  // delete / done-toggle) show INSTANTLY, independent of a server refresh. The
  // effect re-syncs whenever the server's list data actually changes.
  const [ll, setLl] = useState<BoardList[]>(lists);
  const listsSig = lists.map((l) => `${l.id}:${l.name}:${l.color}:${l.position}:${l.isDone}`).join("|");
  useEffect(() => {
    setLl(lists);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listsSig]);
  const patchLocal = (id: string, patch: Partial<BoardList>) =>
    setLl((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const ordered = [...ll].sort((a, b) => a.position - b.position);
  const firstListId = ordered[0]?.id ?? null;
  const doneListId = ll.find((l) => l.isDone)?.id ?? null;

  const cards: Card[] = useMemo(() => {
    const open = tasks.map((t, i) => ({
      id: t.id,
      title: t.title,
      area: t.area,
      dueIso: t.dueIso,
      checklist: t.checklist ? { done: t.checklist.done, total: t.checklist.total } : null,
      labels: t.labels ?? [],
      listId: t.boardListId ?? firstListId,
      pos: t.boardPos ?? 0,
      ord: i,
      completed: false,
    }));
    const openIds = new Set(open.map((o) => o.id));
    const doneCards = doneListId
      ? done
          .filter((d) => !openIds.has(d.id))
          .map((d, i) => ({
            id: d.id,
            title: d.title,
            area: d.area,
            dueIso: null,
            checklist: null,
            labels: [] as string[],
            listId: doneListId,
            pos: -1 - i, // most-recent first
            ord: 10000 + i,
            completed: true,
          }))
      : [];
    return [...open, ...doneCards];
  }, [tasks, done, firstListId, doneListId]);

  const effList = (c: Card): string | null => moves[c.id]?.listId ?? c.listId;
  const effPos = (c: Card): number => moves[c.id]?.pos ?? c.pos;
  const query = q.trim().toLowerCase();
  const matchesQ = (c: Card): boolean => {
    if (!query) return true;
    return (
      c.title.toLowerCase().includes(query) ||
      (c.area?.toLowerCase().includes(query) ?? false) ||
      c.labels.some((l) => labelMeta(l)?.name.toLowerCase().includes(query))
    );
  };
  const listCards = (listId: string): Card[] =>
    cards
      .filter((c) => effList(c) === listId && matchesQ(c))
      .sort((a, b) => effPos(a) - effPos(b) || a.ord - b.ord);

  async function place(id: string, listId: string, beforeId: string | null) {
    if (busy) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const dest = listCards(listId).filter((c) => c.id !== id && !c.completed);
    let idx = beforeId ? dest.findIndex((c) => c.id === beforeId) : dest.length;
    if (idx < 0) idx = dest.length;
    const orderedIds = [...dest.slice(0, idx), card, ...dest.slice(idx)].map((c) => c.id);

    const optimistic: Record<string, Override> = { ...moves };
    orderedIds.forEach((cid, k) => (optimistic[cid] = { listId, pos: k }));
    setMoves(optimistic);
    setBusy(true);
    try {
      const res = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ list_id: listId, ordered_ids: orderedIds }),
      });
      if (!res.ok) throw new Error();
      if (listId === doneListId && !card.completed) toast("Task completed ✓");
      else if (card.completed && listId !== doneListId) toast("Task reopened ↩");
      setTimeout(() => {
        setMoves({});
        router.refresh();
      }, 700);
    } catch {
      setMoves(moves);
      toast("Couldn't move that — try again", "err");
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: string) {
    if (busy) return;
    setBusy(true);
    setMoves((m) => (doneListId ? { ...m, [id]: { listId: doneListId, pos: 0 } } : m));
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: id }),
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
      toast("Couldn't complete that — try again", "err");
    } finally {
      setBusy(false);
    }
  }

  // ——— list management (optimistic: update local state, then persist) ———
  async function postList(payload: Record<string, unknown>): Promise<any | null> {
    setBusy(true);
    try {
      const res = await fetch("/api/board/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.error ?? "That didn't work — try again", "err");
        return null;
      }
      return j;
    } catch {
      toast("Network error — try again", "err");
      return null;
    } finally {
      setBusy(false);
    }
  }
  function openEditor(lane: BoardList) {
    setNameDraft(lane.name);
    setEditList(lane.id);
  }
  async function renameList(id: string) {
    const name = nameDraft.trim();
    const prev = ll.find((l) => l.id === id)?.name;
    if (!name || name === prev) return;
    patchLocal(id, { name }); // instant
    const ok = await postList({ action: "update", id, name });
    if (ok) toast("List renamed ✓");
    else if (prev) patchLocal(id, { name: prev });
  }
  async function recolor(id: string, color: string) {
    const prev = ll.find((l) => l.id === id)?.color;
    patchLocal(id, { color }); // instant
    const ok = await postList({ action: "update", id, color });
    if (!ok && prev) patchLocal(id, { color: prev });
  }
  async function toggleDone(id: string) {
    const cur = ll.find((l) => l.id === id);
    if (!cur) return;
    const next = !cur.isDone;
    setLl((list) => list.map((l) => (l.id === id ? { ...l, isDone: next } : { ...l, isDone: next ? false : l.isDone })));
    const ok = await postList({ action: "update", id, is_done: next });
    if (ok) toast(next ? "This list now completes tasks ✓" : "Completion turned off");
    else patchLocal(id, { isDone: cur.isDone });
  }
  async function moveList(id: string, dir: -1 | 1) {
    const idx = ordered.findIndex((l) => l.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ordered.length) return;
    const arr = [...ordered];
    [arr[idx], arr[swap]] = [arr[swap]!, arr[idx]!];
    setLl(arr.map((l, i) => ({ ...l, position: i }))); // instant reindex
    await postList({ action: "reorder", ordered_ids: arr.map((l) => l.id) });
  }
  async function addList() {
    const name = newName.trim();
    if (!name || busy) return;
    setNewName("");
    setAdding(false);
    const j = await postList({ action: "create", name });
    if (j?.list) {
      setLl((cur) => [
        ...cur,
        { id: j.list.id, name: j.list.name, color: j.list.color, position: j.list.position, isDone: !!j.list.is_done },
      ]);
      toast("List added ✓");
    }
  }
  async function deleteList(id: string, name: string) {
    if (!window.confirm(`Delete the "${name}" list? Its tasks move to the first list.`)) return;
    const ok = await postList({ action: "delete", id });
    if (ok) {
      setLl((cur) => cur.filter((l) => l.id !== id));
      setEditList(null);
      toast("List deleted");
      router.refresh(); // reconcile task fallback (their board_list_id cleared)
    }
  }

  // ——— drag a whole list (column) to reorder ———
  function nextListId(id: string): string | null {
    const i = ordered.findIndex((l) => l.id === id);
    return i >= 0 && i < ordered.length - 1 ? ordered[i + 1]!.id : null;
  }
  async function placeList(id: string, beforeId: string | null) {
    const dragged = ordered.find((l) => l.id === id);
    if (!dragged) return;
    const arr = ordered.filter((l) => l.id !== id);
    let i = beforeId ? arr.findIndex((l) => l.id === beforeId) : arr.length;
    if (i < 0) i = arr.length;
    arr.splice(i, 0, dragged);
    setLl(arr.map((l, idx) => ({ ...l, position: idx }))); // instant
    await postList({ action: "reorder", ordered_ids: arr.map((l) => l.id) });
  }
  function computeListDrop(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y);
    const laneEl = el?.closest("[data-list]") as HTMLElement | null;
    if (!laneEl || !rootRef.current?.contains(laneEl)) return listDropId;
    const id = laneEl.getAttribute("data-list")!;
    const r = laneEl.getBoundingClientRect();
    return x < r.left + r.width / 2 ? id : nextListId(id);
  }
  function onListGripDown(e: React.PointerEvent, lane: BoardList) {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setListDragId(lane.id);
    setGhost({ x: e.clientX, y: e.clientY, title: lane.name });
  }
  function onListGripMove(e: React.PointerEvent) {
    if (!listDragId) return;
    e.preventDefault();
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    setListDropId(computeListDrop(e.clientX, e.clientY));
  }
  function onListGripUp(e: React.PointerEvent) {
    if (!listDragId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const id = listDragId;
    const before = listDropId;
    setListDragId(null);
    setListDropId(null);
    setGhost(null);
    if (before !== id) placeList(id, before);
  }

  // ——— pointer drag ———
  function computeDrop(x: number, y: number): Drop | null {
    const el = document.elementFromPoint(x, y);
    const laneEl = el?.closest("[data-list]") as HTMLElement | null;
    if (!laneEl || !rootRef.current?.contains(laneEl)) return null;
    const listId = laneEl.getAttribute("data-list")!;
    const cardEls = Array.from(laneEl.querySelectorAll<HTMLElement>("[data-card-id]"));
    for (const ce of cardEls) {
      const cid = ce.getAttribute("data-card-id")!;
      if (cid === dragId) continue;
      const r = ce.getBoundingClientRect();
      if (y < r.top + r.height / 2) return { listId, beforeId: cid };
    }
    return { listId, beforeId: null };
  }
  function onGripDown(e: React.PointerEvent, card: Card) {
    if (busy) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(card.id);
    setGhost({ x: e.clientX, y: e.clientY, title: card.title });
    setDrop({ listId: effList(card) ?? firstListId ?? "", beforeId: null });
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
    if (target) place(id, target.listId, target.beforeId);
  }

  const dropLine = (listId: string, beforeId: string | null) =>
    dragId && drop?.listId === listId && drop.beforeId === beforeId ? (
      <div className="mx-0.5 my-1 h-[3px] rounded-full bg-accent shadow-[0_0_10px_0_#C2F24C]" />
    ) : null;

  const colW = fill ? "w-[300px]" : "w-[270px]";

  return (
    <div className={`flex flex-col gap-2.5 ${fill ? "h-full min-h-0" : ""}`}>
      {/* in-board search */}
      <div className="px-0.5">
        <div className="relative max-w-[340px]">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink3">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search this board — title, area, label…"
            className="w-full rounded-[9px] border border-line bg-card py-1.5 pl-7 pr-7 text-[12.5px] text-ink outline-none focus:border-[#3A3F47]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-ink3 hover:text-ink"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        ref={rootRef}
        className={`-mx-2.5 flex gap-3 overflow-x-auto px-2.5 pb-1 ${fill ? "min-h-0 flex-1" : ""}`}
      >
      {ordered.map((lane) => {
        const list = listCards(lane.id);
        const openCount = list.filter((c) => !c.completed).length;
        const active = dragId && drop?.listId === lane.id;
        const editing = editList === lane.id;
        const idx = ordered.findIndex((l) => l.id === lane.id);
        return (
          <div
            key={lane.id}
            data-list={lane.id}
            style={{
              borderColor: active || listDropId === lane.id ? "#C2F24C" : lane.color + "88",
              background: lane.color + "0D",
            }}
            className={`flex ${colW} shrink-0 flex-col rounded-[14px] border-2 p-2.5 transition ${fill ? "min-h-0" : ""} ${
              listDragId === lane.id ? "opacity-40" : ""
            }`}
          >
            {/* header */}
            <div className="mb-2 flex items-center gap-1.5 px-0.5">
              <button
                type="button"
                onPointerDown={(e) => onListGripDown(e, lane)}
                onPointerMove={onListGripMove}
                onPointerUp={onListGripUp}
                onPointerCancel={onListGripUp}
                title="Drag to reorder list"
                aria-label="Drag to reorder list"
                style={{ touchAction: "none" }}
                className="shrink-0 cursor-grab select-none text-[13px] leading-none text-ink3 hover:text-ink active:cursor-grabbing"
              >
                ⠿
              </button>
              <span style={{ background: lane.color }} className="h-2.5 w-2.5 shrink-0 rounded-full" />
              <button
                type="button"
                onClick={() => openEditor(lane)}
                title="List settings"
                className="min-w-0 flex-1 truncate text-left text-[13px] font-bold text-inkstrong hover:underline"
              >
                {lane.name}
              </button>
              {lane.isDone && (
                <span
                  title="Tasks dropped here are marked complete"
                  className="shrink-0 rounded-[4px] bg-[#43D3A21E] px-1 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.04em] text-good"
                >
                  ✓ done
                </span>
              )}
              <span className="font-mono text-[10px] text-inkfaint">{openCount}</span>
              <button
                type="button"
                onClick={() => (editing ? setEditList(null) : openEditor(lane))}
                title="List settings"
                className="rounded-[5px] px-1 text-[13px] leading-none text-ink3 transition hover:bg-line2 hover:text-ink"
              >
                {editing ? "✕" : "⋯"}
              </button>
            </div>

            {/* inline list editor — stays open while you click its controls */}
            {editing && (
              <div className="mb-2 flex flex-col gap-2.5 rounded-[10px] border border-line2 bg-card p-2.5">
                <div className="flex items-center gap-1.5">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameList(lane.id);
                      if (e.key === "Escape") setEditList(null);
                    }}
                    placeholder="List name"
                    autoFocus
                    className="min-w-0 flex-1 rounded-[6px] border border-line bg-cardalt px-2 py-1 text-[13px] font-semibold text-ink outline-none focus:border-[#3A3F47]"
                  />
                  <button
                    type="button"
                    onClick={() => renameList(lane.id)}
                    disabled={busy || !nameDraft.trim() || nameDraft.trim() === lane.name}
                    className="rounded-[6px] bg-accent px-2.5 py-1 text-[11px] font-bold text-[#0C0D10] transition hover:brightness-105 disabled:opacity-40"
                  >
                    Rename
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => recolor(lane.id, c)}
                      style={{ background: c, borderColor: lane.color === c ? "#F3F1EC" : "transparent" }}
                      className="h-5 w-5 rounded-full border-2 transition hover:scale-110"
                      title="Recolor"
                    />
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-ink2">
                  <input
                    type="checkbox"
                    checked={lane.isDone}
                    onChange={() => toggleDone(lane.id)}
                    className="h-3.5 w-3.5 accent-[#43D3A2]"
                  />
                  Completes tasks dropped here
                </label>
                <div className="flex items-center gap-1 border-t border-line2 pt-2">
                  <button
                    type="button"
                    onClick={() => moveList(lane.id, -1)}
                    disabled={idx === 0 || busy}
                    className="rounded-[6px] border border-line px-2 py-1 text-[12px] text-ink3 transition hover:text-ink disabled:opacity-30"
                    title="Move list left"
                  >
                    ‹ left
                  </button>
                  <button
                    type="button"
                    onClick={() => moveList(lane.id, 1)}
                    disabled={idx === ordered.length - 1 || busy}
                    className="rounded-[6px] border border-line px-2 py-1 text-[12px] text-ink3 transition hover:text-ink disabled:opacity-30"
                    title="Move list right"
                  >
                    right ›
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteList(lane.id, lane.name)}
                    disabled={busy}
                    className="ml-auto rounded-[6px] border border-line px-2 py-1 text-[12px] text-danger transition hover:border-danger"
                    title="Delete list"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            )}

            {lane.id === firstListId && (
              <div className="mb-2">
                <BoardAddCard />
              </div>
            )}

            <div className={`flex flex-col overflow-y-auto ${fill ? "min-h-[100px] flex-1" : "max-h-[440px] min-h-[48px]"}`}>
              {list.length === 0 && !active && (
                <div className="rounded-[10px] border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-inkfaint">
                  Drop tasks here
                </div>
              )}
              {list.map((c) => {
                const m = c.area ? areaMeta(c.area) : null;
                return (
                  <div key={c.id}>
                    {dropLine(lane.id, c.id)}
                    <div
                      data-card-id={c.id}
                      className={`mb-2 flex items-start gap-2 rounded-[11px] border border-line bg-card p-2.5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.5)] transition ${
                        dragId === c.id ? "opacity-30" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onPointerDown={(e) => onGripDown(e, c)}
                        onPointerMove={onGripMove}
                        onPointerUp={onGripUp}
                        onPointerCancel={onGripUp}
                        title="Drag to move / reorder"
                        aria-label="Drag to move"
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
                            c.completed ? "text-ink3 line-through" : "text-inkstrong"
                          }`}
                        >
                          {c.title}
                        </button>
                        {c.labels.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <LabelChips labels={c.labels} size="xs" />
                          </div>
                        )}
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
                          {!c.completed && c.dueIso && <TaskTimer dueIso={c.dueIso} />}
                          {!c.completed && (
                            <button
                              type="button"
                              onClick={() => complete(c.id)}
                              disabled={busy}
                              title="Complete"
                              className="ml-auto rounded-[6px] px-1.5 py-0.5 text-[12px] leading-none text-good transition hover:bg-line2"
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {dropLine(lane.id, null)}
            </div>
          </div>
        );
      })}

      {/* add-list column */}
      <div className={`flex ${colW} shrink-0 flex-col`}>
        {adding ? (
          <div className="flex flex-col gap-2 rounded-[14px] border border-accent/40 bg-cardalt p-2.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addList();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="List name…"
              autoFocus
              className="rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink outline-none"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={addList}
                disabled={busy || !newName.trim()}
                className="flex-1 rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-[#0C0D10] disabled:opacity-50"
              >
                Add list
              </button>
              <button type="button" onClick={() => setAdding(false)} className="px-2 text-[12px] text-ink3">
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-[14px] border border-dashed border-line py-3 text-[12.5px] font-semibold text-ink3 transition hover:border-accent hover:text-accent"
          >
            + Add list
          </button>
        )}
      </div>
      </div>

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
