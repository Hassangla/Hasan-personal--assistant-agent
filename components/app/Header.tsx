import Link from "next/link";
import { Clock } from "./Clock";

// Sticky top bar shared by every screen: agent mark + nav (with the live
// Approvals count) + date · clock · ONLINE.
export function Header({
  active,
  pendingCount = 0,
  tz,
  width = "wide",
}: {
  active?: "dashboard" | "people" | "approvals";
  pendingCount?: number;
  tz: string;
  width?: "wide" | "narrow";
}) {
  const maxW = width === "narrow" ? "max-w-[980px]" : "max-w-[1180px]";
  const nav: { key: NonNullable<typeof active>; label: string; href: string }[] = [
    { key: "dashboard", label: "Dashboard", href: "/" },
    { key: "people", label: "People", href: "/people" },
    { key: "approvals", label: "Approvals", href: "/approvals" },
  ];

  return (
    <div className="sticky top-0 z-20 border-b border-[#E5DECF] bg-[rgba(244,241,234,0.88)] backdrop-blur-[10px]">
      <div className={`mx-auto ${maxW} flex items-center justify-between gap-5 px-8 py-[13px]`}>
        <Link href="/" className="flex items-center gap-3 no-underline">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-accent shadow-[0_3px_8px_-2px_rgba(199,95,63,0.5)]">
            <span className="h-[9px] w-[9px] rounded-full bg-white" />
          </span>
          <span className="font-display text-[16px] font-bold tracking-[-0.01em] text-ink">Personal Agent</span>
          <span className="rounded-[5px] border border-[#E0D8C8] px-1.5 py-0.5 font-mono text-[10px] text-ink3">v0.3</span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {nav.map((n) => {
            const on = n.key === active;
            const badge = n.key === "approvals" ? pendingCount : 0;
            return (
              <Link
                key={n.key}
                href={n.href}
                className={`flex items-center gap-1.5 rounded-[9px] px-[13px] py-[7px] text-[13px] font-semibold no-underline transition ${
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

        <div className="flex items-center gap-[18px] font-mono text-[11px] tracking-[0.06em] text-[#8C8474]">
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
