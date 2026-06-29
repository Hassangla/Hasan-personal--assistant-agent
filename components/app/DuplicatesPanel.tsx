"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DuplicatesData, DupPersonGroup, DupTaskGroup } from "@/lib/dashboard/duplicates";

// Review-and-confirm cleanup: remove duplicate tasks (keep the oldest) and merge
// duplicate people (repoint their history to one contact).
export function DuplicatesPanel({ data }: { data: DuplicatesData }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (!data.tasks.length && !data.people.length) return null;

  async function resolveTask(g: DupTaskGroup) {
    if (busy) return;
    setBusy("t:" + g.key);
    try {
      await fetch("/api/tasks/dedupe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ drop_ids: g.ids.slice(1) }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  async function mergePerson(g: DupPersonGroup) {
    if (busy) return;
    setBusy("p:" + g.key);
    try {
      await fetch("/api/people/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keep_id: g.ids[0], drop_ids: g.ids.slice(1) }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "shrink-0 rounded-[7px] border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-ink2 transition hover:border-accent hover:text-accent disabled:opacity-50";

  return (
    <div className="mt-6 rounded-[20px] border border-line bg-card px-5 pb-4 pt-6 sm:px-7">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[12px] tracking-[0.1em] text-inkfaint">04</span>
        <h2 className="m-0 font-display text-[20px] font-bold tracking-[-0.01em] text-ink">Duplicates</h2>
        <span className="hidden text-[13px] text-ink3 sm:inline">— review &amp; merge</span>
      </div>

      <div className="mt-2">
        {data.tasks.map((g) => (
          <div key={"t" + g.key} className="flex items-center gap-3 border-t border-line2 py-2.5 text-[13px]">
            <span className="font-mono text-[11px] text-inkfaint">task</span>
            <span className="min-w-0 flex-1 truncate text-inkstrong">{g.title}</span>
            <span className="shrink-0 font-mono text-[11px] text-ink3">{g.count}×</span>
            <button onClick={() => resolveTask(g)} disabled={busy === "t:" + g.key} className={btn}>
              {busy === "t:" + g.key ? "…" : `Keep 1, drop ${g.count - 1}`}
            </button>
          </div>
        ))}
        {data.people.map((g) => (
          <div key={"p" + g.key} className="flex items-center gap-3 border-t border-line2 py-2.5 text-[13px]">
            <span className="font-mono text-[11px] text-inkfaint">person</span>
            <span className="min-w-0 flex-1 truncate text-inkstrong">{g.name}</span>
            <span className="shrink-0 font-mono text-[11px] text-ink3">{g.count}×</span>
            <button onClick={() => mergePerson(g)} disabled={busy === "p:" + g.key} className={btn}>
              {busy === "p:" + g.key ? "…" : `Merge ${g.count}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
