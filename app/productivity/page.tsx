import { getProductivityData } from "@/lib/dashboard/productivity";
import { getDuplicates } from "@/lib/dashboard/duplicates";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { Card, SectionHeader } from "@/components/app/ui";
import { DuplicatesPanel } from "@/components/app/DuplicatesPanel";

export const dynamic = "force-dynamic";

function Stat({ value, label, sub, color }: { value: string | number; label: string; sub?: string; color: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-card p-4">
      <div className="font-display text-[30px] font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink3">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-inkfaint">{sub}</div>}
    </div>
  );
}

export default async function ProductivityPage() {
  const [d, dups] = await Promise.all([getProductivityData(), getDuplicates()]);

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="productivity" pendingCount={d.pendingCount} tz={USER_TIMEZONE} width="narrow" />

      <div className="mx-auto max-w-[980px] px-4 sm:px-8">
        <div className="mt-[30px]">
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">How you're doing</div>
          <h1 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.025em] text-ink sm:text-[38px]">
            Productivity
          </h1>
        </div>

        {/* STATS */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat value={d.completedWeek} label="Completed · 7 days" sub={`${d.completedToday} today · ${d.completedTotal} all-time`} color="#43D3A2" />
          <Stat value={`${d.completionRate}%`} label="Completion rate" sub="done vs open + dropped" color="#3F9A6E" />
          <Stat value={d.overdue} label="Overdue" sub={`${d.dueToday} due today`} color="#FF6A45" />
          <Stat value={d.followups} label="In follow-up" sub={`avg ${d.avgNudges} nudges`} color="#F3B24C" />
          <Stat value={d.delegated} label="Delegated" sub="being chased for you" color="#5C8DF0" />
          <Stat value={d.dropped} label="Dropped" sub="abandoned tasks" color="#8B9099" />
        </div>

        {/* DELAYS */}
        {d.delayedCount > 0 ? (
          <Card className="mt-6 px-5 pb-4 pt-6 sm:px-7">
            <SectionHeader
              index="⏳"
              title="Delays"
              size={20}
              note={`— ${d.delayedCount} overdue · avg ${d.avgDelayDays}d late · worst ${d.maxDelayDays}d`}
            />
            <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">Most delayed</div>
                {d.topDelays.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 border-t border-line2 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-inkstrong">{t.title}</span>
                    <span style={{ color: t.color }} className="shrink-0 text-[10px] font-semibold">
                      {t.label}
                    </span>
                    <span className="w-[58px] shrink-0 text-right font-mono text-[11px] font-semibold text-danger">
                      {t.days}d late
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">By area</div>
                {d.delaysByArea.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 border-t border-line2 py-1.5 text-[13px]">
                    <span style={{ background: a.color }} className="h-2 w-2 shrink-0 rounded-full" />
                    <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: a.color }}>
                      {a.label}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink3">
                      {a.count} late · avg {a.avgDays}d · max {a.maxDays}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="mt-6 px-5 pb-4 pt-6 sm:px-7">
            <SectionHeader index="⏳" title="Delays" size={20} note="— nothing overdue" />
            <p className="mt-2 text-[13px] text-ink3">No delayed tasks — you're on top of your deadlines. 🎉</p>
          </Card>
        )}

        {/* TREND */}
        <Card className="mt-6 px-5 pb-5 pt-6 sm:px-7">
          <SectionHeader index="01" title="Completed" size={20} note="— last 14 days" />
          <div className="mt-4 flex items-end gap-1.5" style={{ height: 96 }}>
            {d.trend.map((t, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                <div
                  className="w-full rounded-[3px] bg-good"
                  style={{ height: `${Math.max(3, (t.count / d.maxTrend) * 80)}px`, opacity: t.count ? 1 : 0.25 }}
                  title={`${t.count} completed`}
                />
                <span className="font-mono text-[9px] text-inkfaint">{t.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* FALLING BEHIND */}
        {d.behind.length > 0 && (
          <Card className="mt-6 border-[#2A1613] bg-[#2A1613] px-5 pb-4 pt-6 sm:px-7">
            <SectionHeader index="02" title="Falling behind" size={20} note="— needs attention" />
            <div className="mt-2">
              {d.behind.map((a) => (
                <div key={a.area} className="flex items-center gap-3 border-t border-[#2A1613] py-2.5 text-[13px]">
                  <span style={{ background: a.color }} className="h-2 w-2 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: a.color }}>
                    {a.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-[#A6CC3E]">
                    {a.overdue > 0 && `${a.overdue} overdue`}
                    {a.overdue > 0 && a.escalated > 0 && " · "}
                    {a.escalated > 0 && `${a.escalated} escalated`}
                    {` · ${a.open} open`}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* BY AREA */}
        <Card className="mt-6 px-5 pb-4 pt-6 sm:px-7">
          <SectionHeader index="03" title="By area" size={20} note="— open vs done" />
          <div className="mt-2">
            {d.byArea.length ? (
              d.byArea.map((a) => {
                const total = a.open + a.done || 1;
                return (
                  <div key={a.area} className="border-t border-line2 py-2.5">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span style={{ background: a.color }} className="h-2 w-2 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1 truncate font-semibold text-inkstrong">{a.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-ink3">
                        {a.done} done · {a.open} open{a.overdue > 0 ? ` · ${a.overdue} overdue` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-line2">
                      <div className="h-full bg-good" style={{ width: `${(a.done / total) * 100}%` }} />
                      <div className="h-full" style={{ width: `${(a.open / total) * 100}%`, background: a.color + "66" }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-3 text-[13px] text-ink3">No task history yet.</p>
            )}
          </div>
        </Card>

        <DuplicatesPanel data={dups} />
      </div>
    </div>
  );
}
