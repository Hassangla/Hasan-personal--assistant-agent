import Link from "next/link";
import { Clock } from "./Clock";

// Sticky top bar shared by every screen: agent mark + nav (with the live
// Approvals count) + date · clock · ONLINE. On phones the brand name and the
// clock cluster collapse so the mark + nav always fit.
export function Header({
  active,
  pendingCount = 0,
  tz,
  width = "wide",
}: {
  active?: "dashboard" | "calendar" | "goals" | "people" | "approvals" | "archive";
  pendingCount?: number;
  tz: string;
  width?: "wide" | "narrow";
}) {
  const maxW = width === "narrow" ? "max-w-[980px]" : "max-w-[1180px]";
  const nav: { key: NonNullable<typeof active>; label: string; href: string }[] = [
    { key: "dashboard", label: "Dashboard", href: "/" },
    { key: "calendar", label: "Calendar", href: "/calendar" },
    { key: "goals", label: "Goals", href: "/goals" },
    { key: "people", label: "People", href: "/people" },
    { key: "approvals", label: "Approvals", href: "/approvals" },
    { key: "archive", label: "Archive", href: "/archive" },
  ];

  return (
    <div className="sticky top-0 z-20 border-b border-[#E5DECF] bg-[rgba(244,241,234,0.88)] backdrop-blur-[10px]">
      <div className={`mx-auto ${maxW} flex items-center justify-between gap-3 px-4 py-[11px] sm:gap-5 sm:px-8 sm:py-[13px]`}>
        <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline sm:gap-3">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-accent shadow-[0_3px_8px_-2px_rgba(199,95,63,0.5)]">
            <span className="h-[9px] w-[9px] rounded-full bg-white" />
          </span>
          <span className="hidden font-display text-[16px] font-bold tracking-[-0.01em] text-ink sm:inline">
            Personal Agent
          </span>
          <span className="hidden rounded-[5px] border border-[#E0D8C8] px-1.5 py-0.5 font-mono text-[10px] text-ink3 sm:inline">
            v0.3
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {nav.map((n) => {
            const on = n.key === active;
            const badge = n.key === "approvals" ? pendingCount : 0;
            return (
              <Link
                key={n.key}
                href={n.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 py-[7px] text-[12px] font-semibold no-underline transition sm:px-[13px] sm:text-[13px] ${
                  on ? "text-accent" : "text-[#8C8474] hover:bg-black/5 hover:text-[#3F3A32]"
                }`}
                style={on ? { background: "#C75F3F14" } : undefined}
              >
                {n.label}
                {badge > 0 && (
                  <span className="rounded-full bg-[#C75F3F18] px-1.5 py-px font-mono text-[10px] font-semibold text-accent">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-[18px] font-mono text-[11px] tracking-[0.06em] text-[#8C8474] md:flex">
          <Clock tz={tz} mode="header" />
          <span className="inline-flex items-center gap-[7px] text-good">
            <span
              className="inline-block h-[7px] w-[7px] rounded-full bg-good"
              style={{ animation: "pulse 2.4s infinite" }}
            />
            ONLINE
          </span>
        </div>
      </div>
    </div>
  );
}
