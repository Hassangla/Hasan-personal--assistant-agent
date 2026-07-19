"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

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
    <div className="relative z-10 mt-7 border-t border-[#1E2127] pt-6">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2.5">
        {/* A real, visibly-tappable field (the borderless version read as plain
            text on phones — people couldn't find the typing space). */}
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 rounded-[13px] border border-[#2A2E36] bg-card px-3.5 py-[3px] focus-within:border-[#3A3F47] sm:basis-auto">
          <Sparkles className="shrink-0 text-accent" style={{ width: 16, height: 16 }} strokeWidth={2} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="text"
            autoComplete="off"
            enterKeyHint="send"
            placeholder="Tell me anything — a task, a thought, an expense…"
            className="min-w-0 flex-1 border-none bg-transparent py-2 text-[16px] text-ink outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-[11px] bg-accent px-[18px] py-2.5 text-[13px] font-bold text-[#0C0D10] shadow-accent transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Capture"}
        </button>
        <a
          href="/chat"
          className="inline-flex items-center gap-2 rounded-[11px] border border-[#2A2E36] bg-card px-3.5 py-[9px] text-[13px] font-semibold text-ink2 no-underline transition hover:border-[#3A3F47] hover:text-[#E4E2DC]"
        >
          💬 Open Chat
        </a>
      </form>
      {reply && (
        <p className="mt-3 rounded-[10px] border border-line bg-cardalt px-3.5 py-2.5 text-[13px] text-ink2">{reply}</p>
      )}
    </div>
  );
}
