"use client";

import { useEffect, useState } from "react";

// Cosmetic session clock. Renders nothing time-specific on the server (avoids
// hydration mismatch); fills in on mount and ticks every second.
export function Clock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    now
      ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, ...opts }).format(now)
      : null;

  const hm = fmt({ hour: "2-digit", minute: "2-digit" }) ?? "--:--";
  const s = fmt({ second: "2-digit" }) ?? "--";

  return (
    <span className="font-mono leading-none tabular-nums">
      <span className="text-2xl text-text">{hm}</span>
      <span className="ml-1 align-top text-xs text-faint">{s}</span>
    </span>
  );
}
