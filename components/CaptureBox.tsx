"use client";

import { useState } from "react";

// Floating desk-capture box. POSTs to /api/capture (the same pipeline as
// Telegram) on submit — a user action, never on page load.
export function CaptureBox() {
  const [open, setOpen] = useState(false);
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
    <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)]">
      {open ? (
        <form
          onSubmit={submit}
          className="rounded-xl border border-border bg-panel p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Capture</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-1 text-muted hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Tell the agent anything — a task, an expense, a note…"
            className="mt-2 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {reply && (
            <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-xs text-muted">{reply}</p>
          )}
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="mt-2 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send to agent"}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl leading-none text-black shadow-2xl"
          aria-label="Open capture box"
        >
          +
        </button>
      )}
    </div>
  );
}
