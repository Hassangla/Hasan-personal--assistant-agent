"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Two-way calendar linking, both via subscription feeds (no OAuth):
//  • OUT: subscribe Google/iOS to the agent's read-only .ics (webcal one-tap + copy).
//  • IN:  paste your Apple/Google published .ics URL → the agent imports its events.
export function CalendarSync({ httpsUrl, webcalUrl }: { httpsUrl: string; webcalUrl: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  async function importCal(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/import-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`Imported ${j.imported ?? 0} event(s). It’ll keep syncing automatically.`);
        setUrl("");
        router.refresh();
      } else {
        setMsg(j.error ?? "Couldn’t import that URL.");
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
      {/* OUT — subscribe your phone to the agent calendar */}
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">📲 Sync to your phone</div>
      <p className="m-0 mb-2.5 text-[12.5px] leading-normal text-ink2">
        Subscribe in Google Calendar (&ldquo;From URL&rdquo;) or Apple/iOS (&ldquo;Add Subscribed Calendar&rdquo;).
        Read-only and auto-refreshing.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={webcalUrl}
          className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white no-underline shadow-accent transition hover:brightness-105"
        >
          Add to Apple Calendar
        </a>
        <button
          onClick={copy}
          className="rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:text-[#3F3A32]"
        >
          {copied ? "Copied ✓" : "Copy feed URL"}
        </button>
      </div>

      {/* IN — import your own Apple/Google calendar */}
      <div className="mt-3 border-t border-line2 pt-3">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">⤵ Import your calendar</div>
        <p className="m-0 mb-2 text-[12.5px] leading-normal text-ink2">
          Paste your Apple/Google calendar&rsquo;s published <span className="font-mono">.ics</span> or{" "}
          <span className="font-mono">webcal</span> link — its events sync into the agent (one-way in).
        </p>
        <form onSubmit={importCal} className="flex flex-wrap items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="webcal://… or https://…/basic.ics"
            className="min-w-0 flex-1 basis-full rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12.5px] text-ink outline-none sm:basis-auto"
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white shadow-accent transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </form>
        {msg && <p className="m-0 mt-1.5 text-[12px] text-ink2">{msg}</p>}
      </div>
    </div>
  );
}
