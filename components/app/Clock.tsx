"use client";

import { useEffect, useState } from "react";

// Live clock, formatted to the user's timezone. Renders a stable placeholder
// until mounted so server/client hydration never mismatches on the ticking
// value. `header` = inline date · time; `hero` = the big briefing clock.
export function Clock({ tz, mode }: { tz: string; mode: "header" | "hero" }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now
    ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now)
    : "--:--";
  const sec = now
    ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, second: "2-digit", hour12: false }).format(now)
    : "--";
  const date = now
    ? new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now).toUpperCase()
    : "";
  const tzLabel = tz.toUpperCase().replace("/", " / ");

  if (mode === "header") {
    return (
      <>
        <span className="hidden whitespace-nowrap xl:inline" suppressHydrationWarning>
          {date}
        </span>
        <span className="hidden text-[#C8C0B0] xl:inline">·</span>
        <span className="whitespace-nowrap text-inkstrong" suppressHydrationWarning>
          {time}
        </span>
      </>
    );
  }

  return (
    <div className="text-left sm:text-right">
      <div
        className="font-display text-[34px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-ink sm:text-[46px]"
        suppressHydrationWarning
      >
        {time}
        <span className="align-super text-[14px] font-semibold text-[#C0B7A5] sm:text-[18px]"> {sec}</span>
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-ink3">{tzLabel}</div>
    </div>
  );
}
