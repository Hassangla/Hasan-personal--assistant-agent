"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Thumb-reachable bottom navigation on phones (hidden ≥ md, where the top nav
// has room). Five slots: the four everyday screens + a More sheet for the rest.
// Pages already reserve pb-[72px], so nothing hides behind the bar.
export function MobileNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const main = [
    { href: "/", glyph: "🏠", label: "Home" },
    { href: "/chat", glyph: "💬", label: "Chat" },
    { href: "/calendar", glyph: "🗓", label: "Calendar" },
    { href: "/goals", glyph: "🎯", label: "Goals" },
  ];
  const moreItems = [
    { href: "/people", glyph: "👥", label: "People", badge: 0 },
    { href: "/approvals", glyph: "✅", label: "Approvals", badge: pendingCount },
    { href: "/productivity", glyph: "📈", label: "Productivity", badge: 0 },
    { href: "/archive", glyph: "🗂", label: "Archive", badge: 0 },
  ];
  const moreActive = moreItems.some((m) => pathname === m.href);

  const item = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-0.5 rounded-[10px] py-1.5 no-underline transition ${
      active ? "text-accent" : "text-[#8C8474]"
    }`;

  return (
    <>
      {more && <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setMore(false)} />}
      {more && (
        <div className="fixed inset-x-3 bottom-[74px] z-50 rounded-[16px] border border-line bg-card p-2 shadow-[0_18px_40px_-12px_rgba(60,45,30,0.4)] md:hidden">
          {moreItems.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setMore(false)}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-semibold no-underline ${
                pathname === m.href ? "bg-[#C75F3F14] text-accent" : "text-ink2 hover:bg-cardalt"
              }`}
            >
              <span className="text-[16px]">{m.glyph}</span>
              {m.label}
              {m.badge > 0 && (
                <span className="ml-auto rounded-full bg-[#C75F3F18] px-2 py-px font-mono text-[11px] font-semibold text-accent">
                  {m.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 border-t border-[#E5DECF] bg-[rgba(244,241,234,0.96)] px-2 shadow-[0_-8px_24px_-14px_rgba(60,45,30,0.4)] backdrop-blur-[10px] md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)", paddingTop: "6px" }}
      >
        {main.map((m) => {
          const active = pathname === m.href;
          return (
            <Link key={m.href} href={m.href} className={item(active)}>
              <span className="text-[17px] leading-none">{m.glyph}</span>
              <span className="text-[10px] font-semibold">{m.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore((v) => !v)} className={item(more || moreActive)}>
          <span className="relative text-[17px] leading-none">
            ⋯
            {pendingCount > 0 && (
              <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </span>
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>
    </>
  );
}
