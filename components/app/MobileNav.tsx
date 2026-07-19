"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Columns3,
  Calendar,
  Target,
  Users,
  CheckCircle2,
  BarChart3,
  Archive,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

// Thumb-reachable bottom navigation on phones (hidden ≥ md, where the top nav
// has room). Everyday screens live on the bar; the rest sit in a More sheet.
export function MobileNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const main: { href: string; Icon: LucideIcon; label: string }[] = [
    { href: "/", Icon: Home, label: "Home" },
    { href: "/board", Icon: Columns3, label: "Board" },
    { href: "/calendar", Icon: Calendar, label: "Calendar" },
    { href: "/goals", Icon: Target, label: "Goals" },
  ];
  const moreItems: { href: string; Icon: LucideIcon; label: string; badge: number }[] = [
    { href: "/people", Icon: Users, label: "People", badge: 0 },
    { href: "/approvals", Icon: CheckCircle2, label: "Approvals", badge: pendingCount },
    { href: "/productivity", Icon: BarChart3, label: "Productivity", badge: 0 },
    { href: "/archive", Icon: Archive, label: "Archive", badge: 0 },
  ];
  const moreActive = moreItems.some((m) => pathname === m.href);

  const item = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-1 rounded-[10px] py-1.5 no-underline transition ${
      active ? "text-accent" : "text-[#9AA0A8]"
    }`;

  return (
    <>
      {more && <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setMore(false)} />}
      {more && (
        <div className="fixed inset-x-3 bottom-[74px] z-50 rounded-[16px] border border-line bg-card p-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.5)] md:hidden">
          {moreItems.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setMore(false)}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-semibold no-underline ${
                pathname === m.href ? "bg-[#C2F24C14] text-accent" : "text-ink2 hover:bg-cardalt"
              }`}
            >
              <m.Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              {m.label}
              {m.badge > 0 && (
                <span className="ml-auto rounded-full bg-[#C2F24C18] px-2 py-px font-mono text-[11px] font-semibold text-accent">
                  {m.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 border-t border-[#202329] bg-[rgba(12,13,16,0.96)] px-2 shadow-[0_-8px_24px_-14px_rgba(0,0,0,0.5)] backdrop-blur-[10px] md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)", paddingTop: "6px" }}
      >
        {main.map((m) => {
          const active = pathname === m.href;
          return (
            <Link key={m.href} href={m.href} className={item(active)}>
              <m.Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-semibold">{m.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore((v) => !v)} className={item(more || moreActive)}>
          <span className="relative">
            <MoreHorizontal className="h-[21px] w-[21px]" strokeWidth={2} />
            {pendingCount > 0 && <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-accent" />}
          </span>
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>
    </>
  );
}
