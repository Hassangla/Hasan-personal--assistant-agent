"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, Badge, type Tone } from "./ui";

// A task row with a click-to-complete check circle. Optimistically strikes the
// row through, POSTs to /api/tasks/complete, then refreshes the server data so
// the finished task drops out of the open lists and into the ledger.
export function CompletableTask({
  id,
  title,
  when,
  leadBadge,
  tags = [],
  counter,
  className = "",
}: {
  id: string;
  title: string;
  when?: string | null;
  leadBadge?: string;
  tags?: { tone: Tone; label: string }[];
  counter?: string;
  className?: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function complete() {
    if (busy || done) return;
    setBusy(true);
    setFailed(false);
    setDone(true); // optimistic
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: id }),
      });
      if (!res.ok) throw new Error();
      router.refresh(); // server re-renders; the done task leaves the open lists
    } catch {
      setDone(false); // revert
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`flex items-center gap-2.5 ${className}`}>
      <button
        type="button"
        onClick={complete}
        disabled={busy || done}
        aria-label={done ? "Completed" : "Mark task done"}
        title={failed ? "Couldn't complete — click to retry" : done ? "Completed" : "Mark done"}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] leading-none transition ${
          done
            ? "border-good bg-good/20 text-good"
            : failed
              ? "border-hot text-hot"
              : "border-faint/60 text-transparent hover:border-good hover:text-good"
        }`}
      >
        {busy ? "·" : "✓"}
      </button>

      {leadBadge && <Badge>{leadBadge}</Badge>}

      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          done ? "text-muted line-through decoration-faint" : "text-text"
        }`}
      >
        {title}
      </span>

      {done ? (
        <Pill tone="good">done</Pill>
      ) : (
        tags.map((t, i) => (
          <Pill key={i} tone={t.tone}>
            {t.label}
          </Pill>
        ))
      )}

      {counter && !done && (
        <span className="shrink-0 font-mono text-[10px] text-faint">{counter}</span>
      )}
      {when && (
        <span className="shrink-0 font-mono text-[10px] text-faint">{when}</span>
      )}
    </li>
  );
}
