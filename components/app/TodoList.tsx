"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { List, Table2, Columns3, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { TaskItem } from "@/components/app/TaskItem";
import { TaskTable } from "@/components/app/TaskTable";
import { TaskBoard } from "@/components/app/TaskBoard";
import { TaskFilters, applyFilters, isFiltering, EMPTY_FILTERS, type TaskFilterState } from "@/components/app/TaskFilters";
import { areaMeta } from "@/lib/areas";
import type { TodayTask, DoneTask } from "@/lib/dashboard/queries";
import type { BoardList } from "@/lib/dashboard/board";

const PAGE_SIZE = 15;
type View = "list" | "table" | "board";

// The dashboard To-Do list: persisted view switch — cozy list, Notion-style
// table, or Trello-style board — plus a label/filter bar that narrows every
// view the same way. Pagination on list/table; the board shows lanes in full.
export function TodoList({
  tasks,
  done = [],
  boardLists = [],
}: {
  tasks: TodayTask[];
  done?: DoneTask[];
  boardLists?: BoardList[];
}) {
  const [page, setPage] = useState(0);
  const [view, setView] = useState<View>("list");
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS);

  useEffect(() => {
    const saved = window.localStorage.getItem("pa-todo-view");
    if (saved === "table" || saved === "board") setView(saved);
    try {
      const f = JSON.parse(window.localStorage.getItem("pa-todo-filters") ?? "");
      if (f && typeof f === "object" && Array.isArray(f.areas)) setFilters({ ...EMPTY_FILTERS, ...f });
    } catch {
      /* none saved */
    }
  }, []);
  function switchView(v: View) {
    setView(v);
    try {
      window.localStorage.setItem("pa-todo-view", v);
    } catch {
      /* private mode */
    }
  }
  function changeFilters(f: TaskFilterState) {
    setFilters(f);
    setPage(0);
    try {
      window.localStorage.setItem("pa-todo-filters", JSON.stringify(f));
    } catch {
      /* private mode */
    }
  }

  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);
  // The Done lane only understands the label filter — done cards carry no
  // due/checklist/goal data.
  const filteredDone = useMemo(
    () =>
      filters.areas.length
        ? done.filter((d) => d.area && filters.areas.includes(areaMeta(d.area).canonical))
        : done,
    [done, filters],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);

  const navBtn =
    "rounded-[8px] border border-line bg-card px-2.5 py-1 font-mono text-[11px] font-semibold text-ink2 transition hover:border-[#3A3F47] hover:text-[#E4E2DC] disabled:cursor-default disabled:opacity-35";
  const viewBtn = (active: boolean) =>
    `rounded-[7px] px-2 py-1 font-mono text-[11px] font-semibold transition ${
      active ? "bg-card text-ink shadow-[0_1px_3px_rgba(60,45,30,0.15)]" : "text-ink3 hover:text-ink"
    }`;

  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-2">
        {view === "board" ? (
          <Link
            href="/board"
            className="inline-flex items-center gap-1 rounded-[8px] border border-accent/40 bg-[#C2F24C10] px-2.5 py-1 font-mono text-[11px] font-semibold text-accent no-underline transition hover:bg-[#C2F24C1F]"
          >
            <Maximize2 className="h-3 w-3" strokeWidth={2.5} /> Focus board
          </Link>
        ) : (
          <span />
        )}
        <div className="inline-flex items-center gap-0.5 rounded-[9px] bg-line2 p-0.5">
          <button type="button" onClick={() => switchView("list")} title="List view" className={`inline-flex items-center gap-1 ${viewBtn(view === "list")}`}>
            <List className="h-3.5 w-3.5" strokeWidth={2} /> List
          </button>
          <button type="button" onClick={() => switchView("table")} title="Table view" className={`inline-flex items-center gap-1 ${viewBtn(view === "table")}`}>
            <Table2 className="h-3.5 w-3.5" strokeWidth={2} /> Table
          </button>
          <button type="button" onClick={() => switchView("board")} title="Board view" className={`inline-flex items-center gap-1 ${viewBtn(view === "board")}`}>
            <Columns3 className="h-3.5 w-3.5" strokeWidth={2} /> Board
          </button>
        </div>
      </div>

      <TaskFilters filters={filters} onChange={changeFilters} total={tasks.length} shown={filtered.length} />

      {/* Board always renders its lists (empty is fine — you still see the
          columns). The "no matches" message is only for list/table. */}
      {view === "board" ? (
        <TaskBoard tasks={filtered} done={filteredDone} lists={boardLists} />
      ) : filtered.length === 0 && isFiltering(filters) ? (
        <p className="py-6 text-center text-[13.5px] text-ink3">Nothing matches these filters.</p>
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
            labels={t.labels}
          />
        ))
      )}
      {view !== "board" && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 border-t border-line2 pt-2.5">
          <button type="button" onClick={() => setPage(cur - 1)} disabled={cur === 0} className={`inline-flex items-center gap-1 ${navBtn}`}>
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> Prev
          </button>
          <span className="font-mono text-[11px] text-ink3">
            {cur * PAGE_SIZE + 1}–{Math.min(filtered.length, (cur + 1) * PAGE_SIZE)} of {filtered.length} · page{" "}
            {cur + 1}/{pages}
          </span>
          <button type="button" onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className={`inline-flex items-center gap-1 ${navBtn}`}>
            Next <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      )}
    </>
  );
}
