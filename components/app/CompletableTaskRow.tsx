"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import { toast } from "@/components/app/Toast";

type StateChip = { color: string; label: string };

// One click-to-complete task row, used across Today, the two Following-up lists,
// and Area tasks. Optimistic: on click the circle flips to a solid green check
// (rendered as a separate element, never by mutating one node), the title
// strikes through, the trailing chip becomes "Done", then after ~1s the row
// refreshes out of the open list. Reverts + reddens the circle on failure.
export function CompletableTaskRow({
  id,
  title,
  layout = "today",
  badge,
  area,
  state,
  note,
  noteColor,
  who,
  dueIso,
}: {
  id: string;
  title: string;
  layout?: "today" | "area" | "chaseYou" | "chaseOthers";
  badge?: string | null;
  area?: string | null;
  state?: StateChip | null;
  note?: string | null;
  noteColor?: string | null;
  who?: string | null;
  dueIso?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const size = layout === "today" || layout === "area" ? 21 : 19;

  async function complete() {
    if (busy || done) return;
    setBusy(true);
    setFailed(false);
    setDone(true);
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: id }),
      });
      if (!res.ok) throw new Error();
      toast("Task completed ✓");
      setTimeout(() => router.refresh(), 900);
    } catch {
      setDone(false);
      setFailed(true);
      setBusy(false);
      toast("Couldn't complete that — try again", "err");
    }
  }

  const circle = done ? (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-good bg-good text-white"
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  ) : (
    <button
      type="button"
      onClick={complete}
      title={layout === "chaseOthers" ? "Confirm finished" : "Mark done"}
      aria-label={layout === "chaseOthers" ? "Confirm finished" : "Mark task done"}
      style={{ width: size, height: size, borderColor: failed ? "#FF6A45" : "#3A3F47" }}
      className="shrink-0 cursor-pointer rounded-full border-2 bg-transparent transition hover:border-good"
    />
  );

  const m = area ? areaMeta(area) : null;
  const titleStyle = done
    ? { color: "#71767F", textDecoration: "line-through" as const }
    : { color: "#F3F1EC" };

  const donePill =
    layout === "chaseYou" ? (
      <span className="shrink-0 whitespace-nowrap font-mono text-[10px] font-semibold uppercase text-good">Done</span>
    ) : (
      <span className="shrink-0 whitespace-nowrap rounded-[6px] bg-[#43D3A218] px-2 py-1 font-mono text-[10px] font-semibold uppercase text-good">
        Done
      </span>
    );

  if (layout === "today" || layout === "area") {
    return (
      <div className="-mx-2.5 flex items-center gap-[13px] rounded-[10px] border-t border-line2 px-2.5 py-[13px] hover:bg-cardalt">
        {circle}
        {badge && <span className="w-5 shrink-0 font-mono text-[11px] font-semibold text-inkfaint">{badge}</span>}
        <button
          type="button"
          onClick={() => router.push(`${pathname}?task=${id}`)}
          title="Open task details"
          className="block min-w-0 flex-1 truncate text-left text-[15px] font-medium hover:underline"
          style={titleStyle}
        >
          {title}
        </button>
        {layout === "today" && m && (
          <span
            style={{ color: m.color, background: m.color + "14" }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-[9px] py-1 text-[12px] font-semibold"
          >
            <span style={{ background: m.color }} className="h-1.5 w-1.5 rounded-full" />
            {m.label}
          </span>
        )}
        {done ? (
          donePill
        ) : dueIso ? (
          <TaskTimer dueIso={dueIso} />
        ) : (
          state && (
            <span
              style={{ color: state.color, background: state.color + "16" }}
              className="shrink-0 whitespace-nowrap rounded-[6px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.03em]"
            >
              {state.label}
            </span>
          )
        )}
      </div>
    );
  }

  if (layout === "chaseYou") {
    return (
      <div className="flex items-center gap-[11px] border-t border-line2 py-[11px]">
        {circle}
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium" style={titleStyle}>
          {title}
        </span>
        {m && (
          <span style={{ color: m.color }} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold">
            <span style={{ background: m.color }} className="h-[5px] w-[5px] rounded-full" />
            {m.label}
          </span>
        )}
        {done ? (
          donePill
        ) : (
          note && (
            <span className="shrink-0 whitespace-nowrap font-mono text-[10px]" style={{ color: noteColor || "#71767F" }}>
              {note}
            </span>
          )
        )}
      </div>
    );
  }

  // chaseOthers — delegated, with a "with <who> · <area>" subline.
  return (
    <div className="flex items-center gap-[11px] border-t border-line2 py-[11px]">
      {circle}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium" style={titleStyle}>
          {title}
        </div>
        <div className="truncate text-[11px] text-ink3">
          with {who} · {m?.label ?? area}
        </div>
      </div>
      {done ? (
        donePill
      ) : (
        note && (
          <span
            className="shrink-0 whitespace-nowrap rounded-[6px] px-2 py-1 font-mono text-[10px] font-semibold"
            style={{ color: noteColor || "#5C8DF0", background: (noteColor || "#5C8DF0") + "16" }}
          >
            {note}
          </span>
        )
      )}
    </div>
  );
}
