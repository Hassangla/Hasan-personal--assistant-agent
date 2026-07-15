import Link from "next/link";
import { Clock } from "./Clock";
import { MobileNav } from "./MobileNav";
import { NotificationBell } from "./NotificationBell";

// Sticky top bar shared by every screen: agent mark + nav (with the live
// Approvals count) + date · clock · ONLINE. On phones the brand name and the
// clock cluster collapse so the mark + nav always fit.
export function Header({
  active,
  pendingCount = 0,
  tz,
  width = "wide",
}: {
  active?: "dashboard" | "chat" | "board" | "calendar" | "goals" | "people" | "approvals" | "archive" | "productivity";
  pendingCount?: number;
  tz: string;
  width?: "wide" | "narrow";
}) {
  // Header always spans the wider track so the full nav fits, even on pages
  // whose content is the narrower 980 column.
  void width;
  const maxW = "max-w-[1180px]";
  const nav: { key: NonNullable<typeof active>; label: string; href: string }[] = [
    { key: "dashboard", label: "Dashboard", href: "/" },
    { key: "chat", label: "Chat", href: "/chat" },
    { key: "board", label: "Board", href: "/board" },
    { key: "calendar", label: "Calendar", href: "/calendar" },
    { key: "goals", label: "Goals", href: "/goals" },
    { key: "people", label: "People", href: "/people" },
    { key: "approvals", label: "Approvals", href: "/approvals" },
    { key: "productivity", label: "Productivity", href: "/productivity" },
    { key: "archive", label: "Archive", href: "/archive" },
  ];

  return (
    <>
    <div className="sticky top-0 z-20 border-b border-[#202329] bg-[rgba(12,13,16,0.88)] backdrop-blur-[10px]">
      <div className={`mx-auto ${maxW} flex items-center justify-between gap-3 px-4 py-[10px] sm:gap-5 sm:px-8 sm:py-[13px]`}>
        <Link href="/" className="flex min-w-0 shrink items-center gap-2.5 no-underline sm:shrink-0 sm:gap-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-accent shadow-[0_0_22px_-4px_#C2F24C]">
            <span className="h-[9px] w-[9px] rounded-full bg-[#0C0D10]" />
          </span>
          <span className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-ink sm:text-[16px]">
            Personal Agent
          </span>
          <span className="hidden rounded-[5px] border border-[#2A2E36] px-1.5 py-0.5 font-mono text-[10px] text-ink3 sm:inline">
            v0.4
          </span>
        </Link>

        <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto md:flex">
          {nav.map((n) => {
            const on = n.key === active;
            const badge = n.key === "approvals" ? pendingCount : 0;
            return (
              <Link
                key={n.key}
                href={n.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 py-[7px] text-[12px] font-semibold no-underline transition sm:px-[13px] sm:text-[13px] ${
                  on ? "bg-accent text-[#0C0D10]" : "text-[#9AA0A8] hover:bg-[#191C22] hover:text-[#E4E2DC]"
                }`}
              >
                {n.label}
                {badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-px font-mono text-[10px] font-semibold ${
                      on ? "bg-[#0C0D10]/20 text-[#0C0D10]" : "bg-[rgba(255,106,69,0.16)] text-danger"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 whitespace-nowrap font-mono text-[11px] tracking-[0.06em] text-[#9AA0A8] md:flex lg:gap-[18px]">
          <Clock tz={tz} mode="header" />
          <span className="inline-flex items-center gap-[7px] text-good">
            <span
              className="inline-block h-[7px] w-[7px] rounded-full bg-good"
              style={{ animation: "pulse 2.4s infinite" }}
            />
            ONLINE
          </span>
          <NotificationBell />
        </div>

        {/* On phones the clock cluster is hidden — bell + a compact ONLINE dot. */}
        <span className="flex shrink-0 items-center gap-2.5 md:hidden">
          <NotificationBell />
          <span
            title="Agent online"
            className="inline-block h-[8px] w-[8px] rounded-full bg-good"
            style={{ animation: "pulse 2.4s infinite" }}
          />
        </span>
      </div>
    </div>
    {/* OUTSIDE the blurred container: backdrop-filter turns an ancestor into
        the containing block for position:fixed, which pinned the bottom nav
        (and its More sheet) to the header instead of the viewport. */}
    <MobileNav pendingCount={pendingCount} />
    </>
  );
}
