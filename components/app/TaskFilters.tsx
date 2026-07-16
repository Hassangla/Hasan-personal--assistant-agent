"use client";

import { AREA_META, areaMeta } from "@/lib/areas";
import { TASK_LABELS } from "@/lib/labels";
import type { TodayTask } from "@/lib/dashboard/queries";

// The filter bar above the To-Do views. Area labels are the primary filter
// (tap to toggle, multi-select); the named labels (Urgent, …), due state,
// checklist, and goal narrow further. Works identically across List, Table,
// and Board.

export type TaskFilterState = {
  areas: string[]; // canonical area names
  labels: string[]; // label keys
  due: "all" | "overdue" | "dated" | "undated";
  checklist: boolean;
  goal: boolean;
};

export const EMPTY_FILTERS: TaskFilterState = { areas: [], labels: [], due: "all", checklist: false, goal: false };

export function isFiltering(f: TaskFilterState): boolean {
  return f.areas.length > 0 || f.labels.length > 0 || f.due !== "all" || f.checklist || f.goal;
}

export function applyFilters(tasks: TodayTask[], f: TaskFilterState): TodayTask[] {
  const now = Date.now();
  return tasks.filter((t) => {
    if (f.areas.length) {
      const canonical = t.area ? areaMeta(t.area).canonical : null;
      if (!canonical || !f.areas.includes(canonical)) return false;
    }
    // Labels: match a task carrying ANY of the selected labels.
    if (f.labels.length && !f.labels.some((l) => t.labels?.includes(l))) return false;
    if (f.due === "overdue" && !(t.dueIso && Date.parse(t.dueIso) < now)) return false;
    if (f.due === "dated" && !t.dueIso) return false;
    if (f.due === "undated" && t.dueIso) return false;
    if (f.checklist && !(t.checklist && t.checklist.total > 0)) return false;
    if (f.goal && !t.goalTitle) return false;
    return true;
  });
}

export function TaskFilters({
  filters,
  onChange,
  total,
  shown,
}: {
  filters: TaskFilterState;
  onChange: (f: TaskFilterState) => void;
  total: number;
  shown: number;
}) {
  function toggleArea(canonical: string) {
    const areas = filters.areas.includes(canonical)
      ? filters.areas.filter((a) => a !== canonical)
      : [...filters.areas, canonical];
    onChange({ ...filters, areas });
  }
  function toggleLabel(key: string) {
    const labels = filters.labels.includes(key)
      ? filters.labels.filter((l) => l !== key)
      : [...filters.labels, key];
    onChange({ ...filters, labels });
  }

  const dueOpts: { key: TaskFilterState["due"]; label: string }[] = [
    { key: "all", label: "All" },
    { key: "overdue", label: "❗ Overdue" },
    { key: "dated", label: "⏳ Dated" },
    { key: "undated", label: "— No deadline" },
  ];

  const toggle = (on: boolean) =>
    `rounded-[7px] border px-2 py-1 font-mono text-[10.5px] font-semibold transition ${
      on ? "border-ink3 bg-card text-ink shadow-[0_1px_3px_rgba(60,45,30,0.12)]" : "border-line bg-transparent text-ink3 hover:text-ink"
    }`;

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
      {AREA_META.map((a) => {
        const on = filters.areas.includes(a.canonical);
        return (
          <button
            key={a.slug}
            type="button"
            onClick={() => toggleArea(a.canonical)}
            title={on ? `Hide ${a.label}` : `Only ${a.label} (add more labels to widen)`}
            style={
              on
                ? { color: "#fff", background: a.color, borderColor: a.color }
                : { color: a.color, background: a.color + "10", borderColor: a.color + "35" }
            }
            className="inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 text-[11px] font-semibold transition"
          >
            <span style={{ background: on ? "#fff" : a.color }} className="h-1.5 w-1.5 rounded-full" />
            {a.label}
          </button>
        );
      })}

      <span className="mx-1 h-4 w-px bg-line" />

      {TASK_LABELS.map((l) => {
        const on = filters.labels.includes(l.key);
        return (
          <button
            key={l.key}
            type="button"
            onClick={() => toggleLabel(l.key)}
            title={on ? `Hide ${l.name}` : `Only ${l.name}`}
            style={
              on
                ? { color: l.color, background: l.color + "24", borderColor: l.color }
                : { color: l.color, background: l.color + "10", borderColor: l.color + "35" }
            }
            className="inline-flex items-center gap-1 rounded-[7px] border px-2 py-1 text-[11px] font-semibold transition"
          >
            <span className="text-[9px]">{l.glyph}</span>
            {l.name}
          </button>
        );
      })}

      <span className="mx-1 h-4 w-px bg-line" />

      <span className="inline-flex gap-1">
        {dueOpts.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange({ ...filters, due: o.key })}
            className={toggle(filters.due === o.key)}
          >
            {o.label}
          </button>
        ))}
      </span>
      <button type="button" onClick={() => onChange({ ...filters, checklist: !filters.checklist })} className={toggle(filters.checklist)}>
        ☑ Checklist
      </button>
      <button type="button" onClick={() => onChange({ ...filters, goal: !filters.goal })} className={toggle(filters.goal)}>
        🎯 Goal
      </button>

      <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px] text-ink3">
        {isFiltering(filters) ? (
          <>
            <span>
              {shown} of {total}
            </span>
            <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-accent hover:underline">
              clear
            </button>
          </>
        ) : (
          <span>{total} tasks</span>
        )}
      </span>
    </div>
  );
}
