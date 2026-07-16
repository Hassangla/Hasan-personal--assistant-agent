"use client";

import { useEffect, useMemo, useState } from "react";
import { TaskBoard } from "@/components/app/TaskBoard";
import { TaskFilters, applyFilters, EMPTY_FILTERS, type TaskFilterState } from "@/components/app/TaskFilters";
import { areaMeta } from "@/lib/areas";
import type { TodayTask, DoneTask } from "@/lib/dashboard/queries";
import type { BoardList } from "@/lib/dashboard/board";

// Full-screen focus board: the filter bar + a board whose lanes fill the
// viewport height. Shares the dashboard's saved filter so the two stay in
// sync. Nothing but the board here — a distraction-free place to work.
export function BoardWorkspace({
  tasks,
  done,
  lists,
}: {
  tasks: TodayTask[];
  done: DoneTask[];
  lists: BoardList[];
}) {
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS);

  useEffect(() => {
    try {
      const f = JSON.parse(window.localStorage.getItem("pa-todo-filters") ?? "");
      if (f && typeof f === "object" && Array.isArray(f.areas)) setFilters({ ...EMPTY_FILTERS, ...f });
    } catch {
      /* none saved */
    }
  }, []);
  function change(f: TaskFilterState) {
    setFilters(f);
    try {
      window.localStorage.setItem("pa-todo-filters", JSON.stringify(f));
    } catch {
      /* private mode */
    }
  }

  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);
  const filteredDone = useMemo(
    () =>
      filters.areas.length ? done.filter((d) => d.area && filters.areas.includes(areaMeta(d.area).canonical)) : done,
    [done, filters],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-8">
      <TaskFilters filters={filters} onChange={change} total={tasks.length} shown={filtered.length} />
      <div className="min-h-0 flex-1">
        <TaskBoard tasks={filtered} done={filteredDone} lists={lists} fill />
      </div>
    </div>
  );
}
