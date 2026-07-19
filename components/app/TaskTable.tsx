"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Check, Target } from "lucide-react";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import type { TodayTask } from "@/lib/dashboard/queries";

type SortKey = "priority" | "title" | "area" | "due" | "goal" | "checklist" | "status";

// Notion-style table view of the To-Do list: sortable columns, click a title
// for the detail panel, complete from the first cell. Scrolls horizontally on
// small screens instead of squeezing.
export function TaskTable({ tasks }: { tasks: TodayTask[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "priority", dir: 1 });
  const [goneIds, setGoneIds] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const arr = [...tasks];
    const { key, dir } = sort;
    if (key === "priority") {
      if (dir === -1) arr.reverse();
      return arr;
    }
    const val = (t: TodayTask): string | number => {
      switch (key) {
        case "title":
          return t.title.toLowerCase();
        case "area":
          return t.area ? areaMeta(t.area).label.toLowerCase() : "￿";
        case "due":
          return t.dueIso ? Date.parse(t.dueIso) : Number.MAX_SAFE_INTEGER;
        case "goal":
          return t.goalTitle?.toLowerCase() ?? "￿";
        case "checklist":
          return t.checklist && t.checklist.total ? t.checklist.done / t.checklist.total : -1;
        default:
          return t.state.label;
      }
    };
    arr.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return arr;
  }, [tasks, sort]);

  async function complete(id: string) {
    if (goneIds.has(id)) return;
    setGoneIds((s) => new Set(s).add(id));
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: id }),
      });
      if (!res.ok) throw new Error();
      setTimeout(() => router.refresh(), 800);
    } catch {
      setGoneIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  function header(key: SortKey, label: string) {
    const active = sort.key === key;
    return (
      <th className="whitespace-nowrap border-b border-line px-2.5 py-2 text-left">
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}
          className={`font-mono text-[10px] uppercase tracking-[0.08em] transition hover:text-ink ${
            active ? "text-ink" : "text-ink3"
          }`}
        >
          {label}
          {active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  }

  return (
    <div className="-mx-2.5 overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="w-8 border-b border-line px-2.5 py-2" />
            {header("priority", "P")}
            {header("title", "Task")}
            {header("area", "Area")}
            {header("due", "Due")}
            {header("goal", "Goal")}
            {header("checklist", "☑")}
            {header("status", "Status")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const m = t.area ? areaMeta(t.area) : null;
            const gone = goneIds.has(t.id);
            return (
              <tr key={t.id} className="border-b border-line2 transition hover:bg-cardalt">
                <td className="px-2.5 py-2">
                  {gone ? (
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-good bg-good text-white">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => complete(t.id)}
                      title="Mark complete"
                      style={{ borderColor: "#3A3F47" }}
                      className="h-[18px] w-[18px] cursor-pointer rounded-full border-2 bg-transparent transition hover:border-good"
                    />
                  )}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[11px] text-inkfaint">{t.priority}</td>
                <td className="max-w-[260px] px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => router.push(`${pathname}?task=${t.id}`)}
                    className="block w-full truncate text-left font-medium hover:underline"
                    style={gone ? { color: "#71767F", textDecoration: "line-through" } : { color: "#F3F1EC" }}
                  >
                    {t.title}
                  </button>
                </td>
                <td className="whitespace-nowrap px-2.5 py-2">
                  {m ? (
                    <span
                      style={{ color: m.color, background: m.color + "14" }}
                      className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-0.5 text-[11.5px] font-semibold"
                    >
                      <span style={{ background: m.color }} className="h-1.5 w-1.5 rounded-full" />
                      {m.label}
                    </span>
                  ) : (
                    <span className="text-inkfaint">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2">
                  {t.dueIso ? <TaskTimer dueIso={t.dueIso} /> : <span className="text-inkfaint">—</span>}
                </td>
                <td className="max-w-[160px] truncate whitespace-nowrap px-2.5 py-2 text-[12px] text-ink2">
                  {t.goalTitle ? (
                    <span className="inline-flex items-center gap-1">
                      <Target className="h-3 w-3 shrink-0" strokeWidth={2} /> {t.goalTitle}
                    </span>
                  ) : (
                    <span className="text-inkfaint">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[11px]">
                  {t.checklist && t.checklist.total > 0 ? (
                    <span className={t.checklist.done === t.checklist.total ? "text-good" : "text-ink2"}>
                      {t.checklist.done}/{t.checklist.total}
                    </span>
                  ) : (
                    <span className="text-inkfaint">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2">
                  <span
                    style={{ color: t.state.color, background: t.state.color + "16" }}
                    className="rounded-[6px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.03em]"
                  >
                    {t.state.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
