"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The hero capture line. POSTs to /api/capture (same pipeline as Telegram) on
// submit only — never on load — then refreshes so any new task/expense appears.
export function CaptureBar() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setReply(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, source: "dashboard" }),
      });
      const j = await res.json().catch(() => ({}));
      setReply(res.ok ? j.reply ?? "Captured." : j.error ?? "Something went wrong.");
      if (res.ok) {
        setText("");
        router.refresh();
      }
    } catch {
      setReply("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7 border-t border-[#EFE9DD] pt-6">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[16px] text-accent">›</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell me anything — a task, a thought, an expense…"
          className="min-w-0 flex-1 basis-full border-none bg-transparent py-1.5 text-[16px] text-ink outline-none sm:basis-auto"
        />
        <span className="inline-flex items-center gap-2 rounded-[11px] border border-[#E2DAC9] bg-card px-3.5 py-[9px] text-[13px] font-semibold text-ink2">
          <span className="h-[7px] w-[7px] rounded-full bg-good" />
          Reply on Telegram
        </span>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-[11px] bg-accent px-[18px] py-2.5 text-[13px] font-bold text-white shadow-accent transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Capture"}
        </button>
      </form>
      {reply && (
        <p className="mt-3 rounded-[10px] border border-line bg-cardalt px-3.5 py-2.5 text-[13px] text-ink2">{reply}</p>
      )}
    </div>
  );
}
