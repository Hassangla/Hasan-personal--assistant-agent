"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X, Minus, Maximize2, Minimize2 } from "lucide-react";
import { ChatThread } from "@/components/app/ChatThread";

// A floating assistant chat: a circular button (bottom-right) that opens a
// compact panel you can expand or minimize — available on every page without
// leaving your workflow. Replaces the full-page chat.
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Remember the last size preference.
  useEffect(() => {
    setExpanded(window.localStorage.getItem("pa-chat-expanded") === "1");
  }, []);
  function toggleExpand() {
    setExpanded((v) => {
      const nv = !v;
      try {
        window.localStorage.setItem("pa-chat-expanded", nv ? "1" : "0");
      } catch {
        /* private mode */
      }
      return nv;
    });
  }

  // Never over the login screen.
  if (pathname === "/login") return null;

  const panelSize = expanded
    ? "h-[85dvh] w-[min(560px,94vw)] sm:h-[80vh]"
    : "h-[min(560px,72dvh)] w-[min(384px,94vw)]";

  return (
    <>
      {open && (
        <div
          className={`fixed bottom-[84px] right-3 z-[80] flex flex-col overflow-hidden rounded-[18px] border border-line bg-page shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] sm:bottom-5 sm:right-5 ${panelSize}`}
        >
          {/* header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-card px-3.5 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent">
              <MessageSquare className="h-4 w-4 text-[#0C0D10]" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[13px] font-bold text-inkstrong">Assistant</div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-inkfaint">same brain, everywhere</div>
            </div>
            <button
              onClick={toggleExpand}
              title={expanded ? "Shrink" : "Expand"}
              className="hidden h-7 w-7 items-center justify-center rounded-[8px] text-ink3 transition hover:bg-line2 hover:text-ink sm:flex"
            >
              {expanded ? <Minimize2 className="h-[15px] w-[15px]" /> : <Maximize2 className="h-[15px] w-[15px]" />}
            </button>
            <button
              onClick={() => setOpen(false)}
              title="Minimize"
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-ink3 transition hover:bg-line2 hover:text-ink"
            >
              <Minus className="h-[17px] w-[17px]" />
            </button>
            <button
              onClick={() => setOpen(false)}
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-ink3 transition hover:bg-line2 hover:text-danger"
            >
              <X className="h-[17px] w-[17px]" />
            </button>
          </div>
          {/* thread (mounted only while open) */}
          <ChatThread />
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Chat with your assistant"
          aria-label="Open assistant chat"
          className="fixed bottom-[84px] right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-[0_10px_28px_-6px_rgba(194,242,76,0.5)] transition hover:brightness-105 active:scale-95 sm:bottom-6 sm:right-6"
        >
          <MessageSquare className="h-6 w-6 text-[#0C0D10]" strokeWidth={2.25} />
        </button>
      )}
    </>
  );
}
