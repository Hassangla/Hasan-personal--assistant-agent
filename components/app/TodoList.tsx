"use client";

import { useState } from "react";
import { TaskItem } from "@/components/app/TaskItem";
import type { TodayTask } from "@/lib/dashboard/queries";

const PAGE_SIZE = 15;

// The dashboard To-Do list with client-side pagination — every open task is
// reachable, not just the first screenful. Priority badges (P1…Pn) stay
// continuous across pages.
export function TodoList({ tasks }: { tasks: TodayTask[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const slice = tasks.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);

  const navBtn =
    "rounded-[8px] border border-line bg-card px-2.5 py-1 font-mono text-[11px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:text-[#3F3A32] disabled:cursor-default disabled:opacity-35";

  return (
    <>
      {slice.map((t) => (
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
        />
      ))}
      {tasks.length > PAGE_SIZE && (
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
