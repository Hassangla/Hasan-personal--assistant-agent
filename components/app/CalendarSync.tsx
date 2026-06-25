"use client";

import { useState } from "react";

// Surfaces the read-only .ics subscription URL: one-tap "Add to Apple Calendar"
// (webcal://) and a copy button for pasting into Google Calendar's "From URL".
export function CalendarSync({ httpsUrl, webcalUrl }: { httpsUrl: string; webcalUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the URL is still selectable below */
    }
  }

  return (
    <div className="mt-4 rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
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
    </div>
  );
}
