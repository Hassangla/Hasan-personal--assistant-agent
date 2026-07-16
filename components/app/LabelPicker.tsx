"use client";

import { TASK_LABELS, labelMeta } from "@/lib/labels";

// Read-only row of label chips (Urgent, Important, …) for cards and rows.
export function LabelChips({ labels, size = "sm" }: { labels: string[] | null | undefined; size?: "sm" | "xs" }) {
  if (!labels || labels.length === 0) return null;
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[10.5px]";
  return (
    <>
      {labels.map((k) => {
        const m = labelMeta(k);
        if (!m) return null;
        return (
          <span
            key={k}
            style={{ color: m.color, background: m.color + "1E", borderColor: m.color + "44" }}
            className={`inline-flex items-center gap-1 rounded-[5px] border font-semibold ${pad}`}
          >
            {m.name}
          </span>
        );
      })}
    </>
  );
}

// Interactive toggles for choosing labels (used in Add-task and the detail panel).
export function LabelPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {TASK_LABELS.map((m) => {
        const on = value.includes(m.key);
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => toggle(m.key)}
            style={
              on
                ? { color: m.color, background: m.color + "24", borderColor: m.color }
                : { borderColor: "#2A2E36" }
            }
            className={`inline-flex items-center gap-1 rounded-[7px] border px-2 py-1 text-[11px] font-semibold transition ${
              on ? "" : "text-ink3 hover:text-ink"
            }`}
          >
            <span className="text-[10px]">{m.glyph}</span>
            {m.name}
          </button>
        );
      })}
    </div>
  );
}
