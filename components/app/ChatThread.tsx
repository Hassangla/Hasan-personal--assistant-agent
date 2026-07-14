"use client";

import { useEffect, useRef, useState } from "react";

// The in-app conversation with the agent — the Telegram replacement. One
// shared thread across channels; polls lightly so replies that happened
// elsewhere (or proactive turns) appear too. The 100dvh flex layout keeps the
// composer visible above the iOS keyboard in the installed app.

type Msg = { id: string; role: "user" | "assistant"; content: string; channel: string; at: string };

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}

export function ChatThread() {
  const [items, setItems] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const pending = useRef(0);

  function scrollDown(smooth = true) {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" }));
  }

  async function refresh(initial = false) {
    if (pending.current > 0) return; // don't clobber the optimistic turn mid-send
    try {
      const j = await fetch("/api/chat/history?limit=60").then((r) => r.json());
      setItems(j.items ?? []);
      if (initial) {
        setLoaded(true);
        scrollDown(false);
      }
    } catch {
      /* offline */
    }
  }

  useEffect(() => {
    refresh(true);
    const t = setInterval(() => refresh(), 25_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const msg = text.trim();
    if (!msg || busy) return;
    setBusy(true);
    setText("");
    pending.current++;
    const now = new Date().toISOString();
    setItems((list) => [
      ...list,
      { id: `tmp-u-${now}`, role: "user", content: msg, channel: "chat", at: now },
      { id: "tmp-typing", role: "assistant", content: "…", channel: "chat", at: now },
    ]);
    scrollDown();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: msg }),
      });
      const j = await res.json().catch(() => ({}));
      const reply = res.ok ? j.reply || "Done." : j.error || "Something went wrong — try again.";
      setItems((list) =>
        list.map((m) => (m.id === "tmp-typing" ? { ...m, id: `tmp-a-${Date.now()}`, content: reply } : m)),
      );
      scrollDown();
    } catch {
      setItems((list) =>
        list.map((m) => (m.id === "tmp-typing" ? { ...m, id: `tmp-a-err`, content: "Network error — try again." } : m)),
      );
    } finally {
      pending.current = 0;
      setBusy(false);
    }
  }

  let lastDay = "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* THREAD */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-4 sm:px-6">
        {!loaded ? (
          <p className="py-10 text-center text-[13px] text-ink3">Loading the conversation…</p>
        ) : items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="m-0 text-[15px] font-semibold text-inkstrong">This is your direct line.</p>
            <p className="m-0 mt-1 text-[13px] text-ink3">
              Tasks, thoughts, expenses, questions — same brain as everywhere else.
            </p>
          </div>
        ) : (
          items.map((m) => {
            const day = dayOf(m.at);
            const sep = day !== lastDay;
            lastDay = day;
            const mine = m.role === "user";
            return (
              <div key={m.id}>
                {sep && (
                  <div className="my-3 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-inkfaint">
                    {day}
                  </div>
                )}
                <div className={`mb-2 flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[86%] whitespace-pre-wrap rounded-[16px] px-3.5 py-2.5 text-[14px] leading-normal sm:max-w-[70%] ${
                      mine
                        ? "rounded-br-[5px] bg-accent text-[#0C0D10] shadow-accent"
                        : "rounded-bl-[5px] border border-line bg-card text-ink"
                    }`}
                  >
                    {m.content}
                    <span
                      className={`mt-1 block text-right font-mono text-[9.5px] ${mine ? "text-white/70" : "text-inkfaint"}`}
                    >
                      {m.channel === "telegram" ? "tg · " : ""}
                      {timeOf(m.at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* COMPOSER */}
      <form
        onSubmit={send}
        className="flex shrink-0 items-end gap-2 border-t border-line bg-[rgba(12,13,16,0.96)] px-3 py-2.5 sm:px-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          enterKeyHint="send"
          placeholder="Message your agent…"
          className="max-h-[120px] min-h-[44px] min-w-0 flex-1 resize-none rounded-[14px] border border-line bg-card px-3.5 py-[11px] text-[16px] text-ink outline-none placeholder:text-inkfaint focus:border-[#3A3F47]"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-accent text-[17px] text-[#0C0D10] shadow-accent transition hover:brightness-105 disabled:opacity-40"
          title="Send"
          aria-label="Send"
        >
          ↑
        </button>
      </form>
    </div>
  );
}
