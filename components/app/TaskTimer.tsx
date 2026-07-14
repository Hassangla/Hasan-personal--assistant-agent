"use client";

import { useEffect, useState } from "react";

// Live task timer: counts down from now to the deadline, and flips to a red
// count-UP once the deadline passes (how overdue it is). Updates every second.
function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function TaskTimer({ dueIso }: { dueIso: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now === null) return null;
  const due = new Date(dueIso).getTime();
  if (Number.isNaN(due)) return null;

  const diff = due - now;
  const overdue = diff < 0;
  const label = fmtDur(Math.abs(diff));

  return (
    <span
      suppressHydrationWarning
      title={overdue ? "Overdue" : "Time until deadline"}
      className="shrink-0 whitespace-nowrap rounded-[6px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.03em] tabular-nums"
      style={overdue ? { color: "#FF6A45", background: "#FF6A4516" } : { color: "#43D3A2", background: "#43D3A216" }}
    >
      {overdue ? `▲ ${label} over` : `⏳ ${label} left`}
    </span>
  );
}
