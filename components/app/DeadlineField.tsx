"use client";

// A friendlier deadline picker: quick-preset chips (Tonight, Tomorrow,
// Weekend, Next week, +1h) plus a datetime-local input. `value` is a
// datetime-local string ("2026-07-16T18:00"); onChange emits the same.

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function at(base: Date, h: number, m = 0): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function presets(): { label: string; value: string }[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  // upcoming Saturday (if today is Sat/Sun, next Saturday)
  const sat = new Date(now);
  const toSat = (6 - now.getDay() + 7) % 7 || 7;
  sat.setDate(now.getDate() + toSat);
  // next Monday
  const mon = new Date(now);
  const toMon = (1 - now.getDay() + 7) % 7 || 7;
  mon.setDate(now.getDate() + toMon);
  const plus1 = new Date(now.getTime() + 60 * 60 * 1000);
  return [
    { label: "+1h", value: fmt(plus1) },
    { label: "Tonight", value: fmt(at(now, 20)) },
    { label: "Tomorrow", value: fmt(at(tomorrow, 9)) },
    { label: "Weekend", value: fmt(at(sat, 10)) },
    { label: "Next week", value: fmt(at(mon, 9)) },
  ];
}

export function DeadlineField({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {presets().map((p) => {
          const on = value === p.value;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.value)}
              style={on ? { borderColor: "#C2F24C", color: "#C2F24C", background: "#C2F24C1A" } : { borderColor: "#2A2E36" }}
              className={`rounded-[7px] border px-2 py-1 font-mono text-[10.5px] font-semibold transition ${
                on ? "" : "text-ink3 hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-[7px] border border-line px-2 py-1 font-mono text-[10.5px] font-semibold text-[#FF6A45] transition hover:border-danger"
          >
            clear
          </button>
        )}
      </div>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12px] text-ink outline-none ${
          compact ? "w-full" : ""
        }`}
      />
    </div>
  );
}
