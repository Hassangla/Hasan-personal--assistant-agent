import type { ReactNode } from "react";

// Numbered "0N // SECTION" panel — the signature command-center shell.
export function Section({
  index,
  label,
  meta,
  children,
  className = "",
}: {
  index: string;
  label: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-border bg-panel/70 ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2 truncate">
          <span className="font-mono text-[10px] tracking-[0.22em] text-faint">
            {index} //
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            {label}
          </span>
        </div>
        {meta != null && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
            {meta}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-1 text-sm text-muted">{children}</p>;
}

const TONE = {
  hot: "border-hot/40 bg-hot/10 text-hot",
  warm: "border-warm/40 bg-warm/10 text-warm",
  cool: "border-cool/40 bg-cool/10 text-cool",
  good: "border-good/40 bg-good/10 text-good",
  muted: "border-border bg-panel2 text-muted",
} as const;

export type Tone = keyof typeof TONE;

export function Pill({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-[5px] border px-1.5 py-[2px] font-mono text-[9px] uppercase tracking-[0.12em] ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-border bg-panel2 px-1 font-mono text-[10px] text-muted">
      {children}
    </span>
  );
}

const DOT = {
  hot: "bg-hot",
  warm: "bg-warm",
  cool: "bg-cool",
  good: "bg-good",
  muted: "bg-faint",
} as const;

export function Dot({ tone = "muted" }: { tone?: Tone }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />;
}
