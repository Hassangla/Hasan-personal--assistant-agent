import { getGoalsData } from "@/lib/dashboard/goals";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { Card, SectionHeader } from "@/components/app/ui";
import { GoalCard } from "@/components/app/GoalCard";
import { NewGoal } from "@/components/app/NewGoal";

export const dynamic = "force-dynamic";

const HORIZONS = [
  { key: "short", label: "Short-term", window: "this week / weeks", index: "01" },
  { key: "medium", label: "Medium-term", window: "this quarter", index: "02" },
  { key: "long", label: "Long-term", window: "this year and beyond", index: "03" },
] as const;

export default async function GoalsPage() {
  const d = await getGoalsData();
  const groups = { short: d.short, medium: d.medium, long: d.long } as const;

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="goals" pendingCount={d.pendingCount} tz={USER_TIMEZONE} width="narrow" />

      <div className="mx-auto max-w-[980px] px-4 sm:px-8">
        <div className="mt-[30px]">
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            Where your work is heading
          </div>
          <h1 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.025em] text-ink sm:text-[38px]">
            Goals
          </h1>
          <p className="m-0 mt-3 max-w-[560px] text-[15px] text-ink2">
            {d.todayDoneLinked > 0
              ? `You moved ${d.todayDoneLinked} goal-linked task${d.todayDoneLinked === 1 ? "" : "s"} forward today.`
              : "Set short- and long-term goals, link tasks to them, and watch your daily work add up."}
          </p>
        </div>

        {HORIZONS.map((h) => (
          <Card key={h.key} className="mt-6 px-5 pb-5 pt-6 sm:px-7">
            <SectionHeader index={h.index} title={h.label} size={20} meta={h.window} />
            {groups[h.key].length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {groups[h.key].map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </div>
            )}
            <div className="mt-3">
              <NewGoal horizon={h.key} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
