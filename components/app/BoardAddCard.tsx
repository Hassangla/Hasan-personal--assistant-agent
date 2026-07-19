"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AREA_META } from "@/lib/areas";
import { LabelPicker } from "@/components/app/LabelPicker";
import { DeadlineField } from "@/components/app/DeadlineField";
import { toast } from "@/components/app/Toast";

// Inline "add a task" card at the top of a board list — capture work without
// leaving the board (dashboard and the /board focus page). The task is created
// directly in `listId` (any non-done list); new tasks get the usual follow-up
// arming.
export function BoardAddCard({ listId }: { listId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [desc, setDesc] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: desc || undefined,
          area: area || undefined,
          labels: labels.length ? labels : undefined,
          due: due || undefined,
          board_list_id: listId || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast("Task added ✓ — follow-up armed");
      setTitle("");
      setArea("");
      setDesc("");
      setLabels([]);
      setDue("");
      setOpen(false);
      router.refresh();
    } catch {
      toast("Couldn't add that — try again", "err");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-full rounded-[11px] border border-dashed border-line py-2.5 text-center text-[12.5px] font-semibold text-ink3 transition hover:border-accent hover:text-accent"
      >
        + Add a task
      </button>
    );
  }

  const input = "rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink outline-none";
  return (
    <form onSubmit={add} className="mt-1 flex flex-col gap-2 rounded-[11px] border border-accent/40 bg-card p-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="What needs doing?"
        autoFocus
        className={`w-full ${input}`}
      />
      <select value={area} onChange={(e) => setArea(e.target.value)} className={`w-full ${input}`}>
        <option value="">Area…</option>
        {AREA_META.map((a) => (
          <option key={a.slug} value={a.canonical}>
            {a.label}
          </option>
        ))}
      </select>
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={2}
        placeholder="Details / notes (optional)…"
        className={`w-full resize-none ${input}`}
      />
      <LabelPicker value={labels} onChange={setLabels} />
      <DeadlineField value={due} onChange={setDue} compact />
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="flex-1 rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-[#0C0D10] shadow-accent transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add task"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-[12px] text-ink3" title="Cancel">
          ✕
        </button>
      </div>
    </form>
  );
}
