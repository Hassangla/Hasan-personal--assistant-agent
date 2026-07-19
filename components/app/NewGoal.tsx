"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function NewGoal({ horizon }: { horizon: "short" | "medium" | "long" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/goals/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ horizon, title }),
      });
      setTitle("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink3 transition hover:text-accent">
        <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New goal
      </button>
    );
  }
  return (
    <form onSubmit={create} className="flex flex-wrap items-center gap-1.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        placeholder="New goal…"
        className="min-w-0 flex-1 basis-full rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink outline-none sm:basis-auto"
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-[#0C0D10] disabled:opacity-50"
      >
        {busy ? "…" : "Add"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-1.5 text-[12px] text-ink3">
        ✕
      </button>
    </form>
  );
}
