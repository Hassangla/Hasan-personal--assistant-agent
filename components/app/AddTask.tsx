"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AREA_META } from "@/lib/areas";
import { LabelPicker } from "@/components/app/LabelPicker";
import { DeadlineField } from "@/components/app/DeadlineField";
import { toast } from "@/components/app/Toast";

// Manually add a task to a section without the chat. The agent still applies
// the same follow-up arming, reminders, and tracking (it routes through
// create_task). For the Delegated section it asks who it's delegated to.
export function AddTask({ variant }: { variant: "todo" | "delegated" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [who, setWho] = useState("");
  const [desc, setDesc] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setErr(false);
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
          delegate_to: variant === "delegated" ? who || undefined : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast(variant === "delegated" ? "Delegated task added → chasing it" : "Task added ✓ — follow-up armed");
      setTitle("");
      setWho("");
      setArea("");
      setDesc("");
      setLabels([]);
      setDue("");
      setOpen(false);
      router.refresh();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1.5 rounded-[8px] px-1 py-1 text-[12.5px] font-semibold text-ink3 transition hover:text-accent"
      >
        <span className="text-[14px] leading-none text-accent">+</span> Add task
      </button>
    );
  }

  const inputCls = "rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink outline-none";
  return (
    <form onSubmit={add} className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={variant === "delegated" ? "Delegated task…" : "New task…"}
          autoFocus
          className={`min-w-0 flex-1 basis-full ${inputCls} sm:basis-auto`}
        />
        <select value={area} onChange={(e) => setArea(e.target.value)} className={inputCls}>
          <option value="">Area…</option>
          {AREA_META.map((a) => (
            <option key={a.slug} value={a.canonical}>
              {a.label}
            </option>
          ))}
        </select>
        {variant === "delegated" && (
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="to whom" className={inputCls} />
        )}
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-[#0C0D10] shadow-accent transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-1.5 py-1 text-[12px] text-ink3" title="Cancel">
          ✕
        </button>
      </div>
      {variant === "todo" && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-line2 bg-cardalt p-2.5">
          <div>
            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink3">Details</div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Description / notes (optional)…"
              className="w-full resize-none rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-inkfaint focus:border-[#3A3F47]"
            />
          </div>
          <div>
            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink3">Labels</div>
            <LabelPicker value={labels} onChange={setLabels} />
          </div>
          <div>
            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink3">Deadline</div>
            <DeadlineField value={due} onChange={setDue} compact />
          </div>
        </div>
      )}
      {err && <span className="text-[11px] text-danger">Couldn’t add that — try again.</span>}
    </form>
  );
}
