"use client";

import { useEffect, useState } from "react";
import { TaskItem } from "@/components/app/TaskItem";
import { TaskTable } from "@/components/app/TaskTable";
import { TaskBoard } from "@/components/app/TaskBoard";
import type { TodayTask, DoneTask } from "@/lib/dashboard/queries";

const PAGE_SIZE = 15;
type View = "list" | "table" | "board";

// The dashboard To-Do list: persisted view switch — cozy list, Notion-style
// table, or Trello-style board — with pagination on list/table (the board
// shows every lane in full).
export function TodoList({ tasks, done = [] }: { tasks: TodayTask[]; done?: DoneTask[] }) {
  const [page, setPage] = useState(0);
  const [view, setView] = useState<View>("list");

  useEffect(() => {
    const saved = window.localStorage.getItem("pa-todo-view");
    if (saved === "table" || saved === "board") setView(saved);
  }, []);
  function switchView(v: View) {
    setView(v);
    try {
      window.localStorage.setItem("pa-todo-view", v);
    } catch {
      /* private mode */
    }
  }

  const pages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const slice = tasks.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);

  const navBtn =
    "rounded-[8px] border border-line bg-card px-2.5 py-1 font-mono text-[11px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:text-[#3F3A32] disabled:cursor-default disabled:opacity-35";
  const viewBtn = (active: boolean) =>
    `rounded-[7px] px-2 py-1 font-mono text-[11px] font-semibold transition ${
      active ? "bg-card text-ink shadow-[0_1px_3px_rgba(60,45,30,0.15)]" : "text-ink3 hover:text-ink"
    }`;

  return (
    <>
      <div className="mb-1 flex justify-end">
        <div className="inline-flex items-center gap-0.5 rounded-[9px] bg-line2 p-0.5">
          <button type="button" onClick={() => switchView("list")} title="List view" className={viewBtn(view === "list")}>
            ≡ List
          </button>
          <button type="button" onClick={() => switchView("table")} title="Table view" className={viewBtn(view === "table")}>
            ⊞ Table
          </button>
          <button type="button" onClick={() => switchView("board")} title="Board view" className={viewBtn(view === "board")}>
            ⫴ Board
          </button>
        </div>
      </div>

      {view === "board" ? (
        <TaskBoard tasks={tasks} done={done} />
      ) : view === "table" ? (
        <TaskTable tasks={slice} />
      ) : (
        slice.map((t) => (
          <TaskItem
            key={t.id}
            id={t.id}
            title={t.title}
            variant="todo"
            badge={t.priority}
            area={t.area}
            state={{ color: t.state.color, label: t.state.label }}
            dueIso={t.dueIso}
            goalTitle={t.goalTitle}
            checklist={t.checklist}
          />
        ))
      )}
      {view !== "board" && tasks.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 border-t border-line2 pt-2.5">
          <button type="button" onClick={() => setPage(cur - 1)} disabled={cur === 0} className={navBtn}>
            ‹ Prev
          </button>
          <span className="font-mono text-[11px] text-ink3">
            {cur * PAGE_SIZE + 1}–{Math.min(tasks.length, (cur + 1) * PAGE_SIZE)} of {tasks.length} · page {cur + 1}/
            {pages}
          </span>
          <button type="button" onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className={navBtn}>
            Next ›
          </button>
        </div>
      )}
    </>
  );
}
