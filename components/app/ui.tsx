import type { CSSProperties, ReactNode } from "react";
import { areaMeta } from "@/lib/areas";

// Shared presentational primitives for the warm command-center redesign.
// Per-area category colors are applied via inline styles (data-driven alpha).

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "·"
  );
}

// Follow-up / task state → category color.
export const STATE_COLOR: Record<string, string> = {
  due: "#C75F3F",
  reminded: "#BC8638",
  ontime: "#2E8C61",
  waiting: "#3C6FB0",
  open: "#828A98",
  done: "#2E8C61",
};

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`rounded-[20px] border border-line bg-card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  color = "#C75F3F",
  className = "",
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <div className={`font-mono text-[11px] uppercase tracking-[0.14em] ${className}`} style={{ color }}>
      {children}
    </div>
  );
}

export function SectionHeader({
  index,
  title,
  note,
  meta,
  size = 21,
}: {
  index: string;
  title: string;
  note?: ReactNode;
  meta?: ReactNode;
  size?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[12px] tracking-[0.1em] text-inkfaint">{index}</span>
        <h2 className="m-0 font-display font-bold tracking-[-0.01em] text-ink" style={{ fontSize: size }}>
          {title}
        </h2>
        {note && <span className="text-[13px] text-ink3">{note}</span>}
      </div>
      {meta != null && (
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{meta}</span>
      )}
    </div>
  );
}

export function AreaTag({ area }: { area: string }) {
  const m = areaMeta(area);
  return (
    <span
      style={{ color: m.color, background: m.color + "14" }}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 py-1 text-[12px] font-semibold"
    >
      <span style={{ background: m.color }} className="h-1.5 w-1.5 rounded-full" />
      {m.label}
    </span>
  );
}

export function StateChip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      style={{ color, background: color + "16" }}
      className="inline-block whitespace-nowrap rounded-[6px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.03em]"
    >
      {children}
    </span>
  );
}

export function Avatar({
  name,
  area,
  size = 34,
  radius = 10,
  fontSize = 13,
}: {
  name: string;
  area?: string | null;
  size?: number;
  radius?: number;
  fontSize?: number;
}) {
  const m = areaMeta(area);
  return (
    <span
      style={{ width: size, height: size, borderRadius: radius, background: m.color + "1c", color: m.color, fontSize }}
      className="flex shrink-0 items-center justify-center font-display font-bold"
    >
      {initialsOf(name)}
    </span>
  );
}
