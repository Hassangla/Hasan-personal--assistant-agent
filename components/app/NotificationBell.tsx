"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlarmClock, CalendarClock, Info, type LucideIcon } from "lucide-react";

// Notification bell: unread badge, dropdown log of everything the agent sent
// (nudges · meeting alerts · tests), tap an entry to jump to what it was about.
// Polls the count once a minute.

type Item = { id: string; kind: string; title: string; body: string | null; url: string | null; read: boolean; at: string };

const KIND_ICON: Record<string, LucideIcon> = {
  task_nudge: AlarmClock,
  meeting: CalendarClock,
  test: Bell,
  system: Info,
};

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  async function refresh(full: boolean) {
    try {
      const j = await fetch(`/api/notifications?limit=${full ? 25 : 1}`).then((r) => r.json());
      setUnread(j.unread ?? 0);
      if (full) setItems(j.items ?? []);
    } catch {
      /* offline */
    }
  }

  useEffect(() => {
    refresh(false);
    const t = setInterval(() => refresh(false), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    refresh(true).finally(() => setLoading(false));
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function openItem(n: Item) {
    if (!n.read) {
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.url) {
      setOpen(false);
      router.push(n.url);
    }
  }

  async function markAll() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setUnread(0);
    setItems((list) => list.map((x) => ({ ...x, read: true })));
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        aria-label="Notifications"
        className="relative flex h-[32px] w-[32px] items-center justify-center rounded-[9px] text-ink2 transition hover:bg-[#191C22] hover:text-ink"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[9.5px] font-bold text-[#0C0D10]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[40px] z-50 w-[340px] max-w-[92vw] overflow-hidden rounded-[14px] border border-line bg-card shadow-[0_18px_44px_-12px_rgba(60,45,30,0.4)]">
          <div className="flex items-center justify-between border-b border-line2 px-3.5 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink3">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="font-mono text-[10.5px] text-accent hover:underline">
                mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {loading && !items.length ? (
              <p className="px-3.5 py-5 text-center text-[12.5px] text-ink3">Loading…</p>
            ) : items.length ? (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-line2 px-3.5 py-2.5 text-left transition hover:bg-cardalt ${
                    n.read ? "opacity-65" : ""
                  }`}
                >
                  {(() => {
                    const Ic = KIND_ICON[n.kind] ?? Bell;
                    return <Ic className="mt-0.5 h-4 w-4 shrink-0 text-ink3" strokeWidth={2} />;
                  })()}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-inkstrong">{n.title}</span>
                    {n.body && <span className="block truncate text-[12px] text-ink2">{n.body}</span>}
                    <span className="mt-0.5 block font-mono text-[10px] text-inkfaint">{ago(n.at)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                </button>
              ))
            ) : (
              <p className="px-3.5 py-5 text-center text-[12.5px] text-ink3">
                Nothing yet — task nudges and meeting alerts will collect here.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
