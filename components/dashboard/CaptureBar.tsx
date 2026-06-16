"use client";

import { useState } from "react";

// Inline capture line. POSTs to /api/capture (same pipeline as Telegram) only
// on submit — never on page load.
export function CaptureBar() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
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
      if (res.ok) setText("");
    } catch {
      setReply("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="flex items-center gap-2">
        <span className="font-mono text-sm text-accent">›</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Capture anything — a task, an expense, a note…"
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent transition hover:bg-accent/20 disabled:opacity-40"
        >
          {busy ? "sending…" : "+ capture"}
        </button>
      </form>
      {reply && (
        <p className="mt-2 rounded-md border border-border bg-panel2 px-3 py-2 text-xs text-muted">
          {reply}
        </p>
      )}
    </div>
  );
}
