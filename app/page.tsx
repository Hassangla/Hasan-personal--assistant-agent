import { getDashboardData } from "@/lib/dashboard/queries";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { Clock } from "@/components/app/Clock";
import { CaptureBar } from "@/components/app/CaptureBar";
import { TodoList } from "@/components/app/TodoList";
import { TaskItem } from "@/components/app/TaskItem";
import { AddTask } from "@/components/app/AddTask";
import { Card, SectionHeader, Eyebrow, AreaTag, Avatar } from "@/components/app/ui";
import Link from "next/link";

// Read-mostly window onto the agent. Rendered per request from Supabase; the
// only writes are click-to-complete and the capture line (both user actions).
export const dynamic = "force-dynamic";

const METRIC_STYLE = [
  { color: "#8A5BD0", bg: "#F3ECFB", border: "#E3D5F4" },
  { color: "#BC8638", bg: "#FAF1DC", border: "#EDDEBE" },
  { color: "#3C6FB0", bg: "#E9F0F9", border: "#D3E0F1" },
  { color: "#C75F3F", bg: "#FBEAE2", border: "#F2D6CA" },
];

export default async function Dashboard() {
  const d = await getDashboardData();
  const metrics = [
    { label: "To-Do", value: d.metrics.openPriorities },
    { label: "Being nudged", value: d.metrics.chasingYou },
    { label: "I'm chasing", value: d.metrics.chasingOthers },
    { label: "Awaiting your OK", value: d.metrics.awaitingOK },
  ];

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="dashboard" pendingCount={d.pendingCount} tz={USER_TIMEZONE} />

      <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
        {/* BRIEFING HERO */}
        <div
          className="mt-5 rounded-[22px] border border-[#EFE2D8] p-6 shadow-hero sm:mt-[30px] sm:p-[36px]"
          style={{ background: "linear-gradient(135deg,#FFFFFF 0%,#FFF7F1 55%,#FCF0F4 100%)" }}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 flex-1">
              <Eyebrow className="mb-3.5">01 — Morning briefing · sent 06:00</Eyebrow>
              <h1 className="m-0 mb-4 font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.025em] text-ink sm:text-[42px] sm:leading-[1.02]">
                {d.briefing.greeting}
              </h1>
              <p className="m-0 max-w-[660px] text-[15px] leading-[1.6] text-[#5B5346] sm:text-[17px] sm:leading-[1.62]">
                {d.briefing.text}
              </p>
              {d.briefing.focus.length > 0 && (
                <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
                  <span className="mr-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-inkfaint">
                    I'd start with
                  </span>
                  {d.briefing.focus.map((f, i) => (
                    <span
                      key={i}
                      className="rounded-[9px] border px-[13px] py-[7px] text-[13px] font-semibold text-accent"
                      style={{ background: "#C75F3F12", borderColor: "#C75F3F33" }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0 sm:min-w-[170px]">
              <Clock tz={USER_TIMEZONE} mode="hero" />
            </div>
          </div>
          <CaptureBar />
        </div>

        {/* METRICS */}
        <div className="mt-[18px] grid grid-cols-2 gap-4 md:grid-cols-4">
          {metrics.map((m, i) => {
            const s = METRIC_STYLE[i]!;
            return (
              <div
                key={i}
                className="rounded-[16px] border p-5 transition hover:-translate-y-[3px] hover:shadow-[0_14px_26px_-18px_rgba(60,45,30,0.4)]"
                style={{ background: s.bg, borderColor: s.border }}
              >
                <div
                  className="font-display text-[37px] font-extrabold leading-none tracking-[-0.02em]"
                  style={{ color: s.color }}
                >
                  {m.value}
                </div>
                <div
                  className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] opacity-[0.72]"
                  style={{ color: s.color }}
                >
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* GOALS PROGRESS STRIP — connects the dashboard to Goals */}
        {d.goalsProgress.length > 0 && (
          <div className="mt-[18px]">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">Goals · progress</span>
              <Link href="/goals" className="font-mono text-[11px] text-accent no-underline hover:underline">
                all goals →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {d.goalsProgress.map((g) => {
                const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
                return (
                  <Link
                    key={g.id}
                    href="/goals"
                    className="block rounded-[14px] border border-line bg-card p-3.5 no-underline transition hover:-translate-y-[2px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-inkstrong">{g.title}</span>
                      <span className="shrink-0 font-mono text-[10px] text-ink3">{pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line2">
                      <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1.5 font-mono text-[10px] text-inkfaint">
                      {g.done}/{g.total} tasks · {g.horizon}-term
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* MAIN GRID */}
        <div className="mt-[34px] grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.55fr_1fr]">
          {/* TODAY */}
          <Card className="px-5 pb-4 pt-6 sm:px-7">
            <SectionHeader index="02" title="To-Do" note="— your tasks" meta={`${d.today.length}`} />
            <div className="mt-1.5">
              {d.today.length ? (
                <TodoList tasks={d.today} />
              ) : (
                <p className="py-6 text-center text-[14px] text-ink3">All clear — add a task below or capture one above.</p>
              )}
              <AddTask variant="todo" />
            </div>
          </Card>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-6">
            {/* TODAY AGENDA — events happening today + tasks due today */}
            <Card className="px-5 pb-4 pt-6 sm:px-6">
              <div className="mb-1 flex items-baseline justify-between">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[12px] tracking-[0.1em] text-inkfaint">03</span>
                  <h3 className="m-0 font-display text-[17px] font-bold tracking-[-0.01em] text-ink">Today</h3>
                  <span className="font-mono text-[11px] text-ink3">{d.todayLabel}</span>
                </div>
                <Link href="/calendar" className="font-mono text-[11px] text-accent no-underline hover:underline">
                  calendar →
                </Link>
              </div>
              <div className="mt-2">
                {d.todayAgenda.length ? (
                  d.todayAgenda.map((it) => {
                    const dot = it.overdue ? "#C04A2E" : it.kind === "event" ? "#3C6FB0" : "#BC8638";
                    const row = (
                      <>
                        <span
                          className="w-[58px] shrink-0 text-right font-mono text-[11px]"
                          style={{ color: it.overdue ? "#C04A2E" : "#8A8069" }}
                        >
                          {it.timeText}
                        </span>
                        <span style={{ background: dot }} className="h-1.5 w-1.5 shrink-0 rounded-full" />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-inkstrong">
                          {it.kind === "event" ? "🗓 " : ""}
                          {it.title}
                        </span>
                      </>
                    );
                    return it.kind === "task" ? (
                      <Link
                        key={it.id}
                        href={`/?task=${it.id}`}
                        title="Open task details"
                        className="-mx-1.5 flex items-center gap-2.5 rounded-[8px] border-t border-line2 px-1.5 py-2 no-underline first:border-t-0 hover:bg-cardalt"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div key={it.id} className="flex items-center gap-2.5 border-t border-line2 py-2 first:border-t-0">
                        {row}
                      </div>
                    );
                  })
                ) : (
                  <p className="py-4 text-center text-[13px] text-ink3">
                    Nothing scheduled today. <Link href="/calendar" className="text-accent no-underline hover:underline">Link a calendar →</Link>
                  </p>
                )}
              </div>
            </Card>

            {/* LIFE AREAS */}
            <Card className="px-5 pb-3.5 pt-6 sm:px-6">
              <SectionHeader index="04" title="Life areas" meta="7" />
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {d.areas.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/areas/${a.slug}`}
                    className="block rounded-[14px] border p-[13px] no-underline transition hover:-translate-y-[2px]"
                    style={{ background: a.color + "12", borderColor: a.color + "30" }}
                  >
                    <div className="flex items-center gap-[7px]">
                      <span style={{ background: a.color }} className="h-2 w-2 shrink-0 rounded-full" />
                      <span className="text-[12.5px] font-bold leading-tight" style={{ color: a.color }}>
                        {a.label}
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <span className="font-display text-[23px] font-extrabold leading-none" style={{ color: a.color }}>
                        {a.open}
                      </span>
                      <span className="text-[10px] font-semibold opacity-70" style={{ color: a.color }}>
                        {" "}
                        open
                      </span>
                      <span
                        className="mt-1 block whitespace-nowrap font-mono text-[9.5px] opacity-[0.72]"
                        style={{ color: a.color }}
                      >
                        {a.note}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            {/* HEARTBEAT */}
            <Card className="px-5 pb-[18px] pt-6 sm:px-6">
              <SectionHeader index="05" title="Heartbeat" meta="per-minute" />
              <div className="mt-3.5">
                {d.heartbeat.map((h, i) => (
                  <div key={i} className="flex items-start gap-[13px] py-[7px]">
                    <span className="w-[42px] shrink-0 pt-0.5 text-right font-mono text-[11px] text-inkfaint">
                      {h.time}
                    </span>
                    <span
                      className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full"
                      style={{ background: h.color, boxShadow: `0 0 0 4px ${h.color}1f` }}
                    />
                    <div className="flex-1">
                      <div className="text-[13.5px] font-semibold leading-snug text-inkstrong">{h.label}</div>
                      <div className="mt-px text-[12px] text-ink3">{h.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* I'M CHASING (delegated) */}
        <div className="mt-9">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[12px] tracking-[0.1em] text-inkfaint">06</span>
            <h2 className="m-0 font-display text-[21px] font-bold tracking-[-0.01em] text-ink">I'm Chasing</h2>
            <span className="hidden text-[13px] text-ink3 sm:inline">— delegated work; I chase them until you confirm it's done</span>
          </div>
          <Card className="px-5 pb-4 pt-[22px] sm:px-[26px]">
            <div className="mb-1 flex items-center gap-[9px]">
              <span className="h-2 w-2 rounded-full bg-blue" />
              <h3 className="m-0 text-[14px] font-bold text-inkstrong">Waiting on others</h3>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-inkfaint">delegated</span>
            </div>
            {d.chasingOthers.length ? (
              d.chasingOthers.map((c) => (
                <TaskItem key={c.id} id={c.id} title={c.title} variant="delegated" area={c.area} who={c.who} />
              ))
            ) : (
              <p className="py-3 text-[13px] text-ink3">Nothing delegated — add one below, or tap → on a To-Do task.</p>
            )}
            <AddTask variant="delegated" />
          </Card>
        </div>

        {/* INBOX + PEOPLE */}
        <div className="mt-9 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="px-5 py-6 sm:px-7">
            <SectionHeader index="07" title="Inbox" note="— triaged, awaiting your OK" />
            <div className="my-3.5 flex items-center gap-[7px] rounded-[8px] bg-[#E9F3EC] px-[11px] py-[7px] text-[12px] text-good">
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              I summarize and draft, but never send without your confirmation.
            </div>
            {d.inbox.length ? (
              d.inbox.map((e) => (
                <div key={e.id} className="border-t border-line2 py-4">
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <span className="text-[13px] font-bold text-inkstrong">{e.from}</span>
                    {e.area && <AreaTag area={e.area} />}
                  </div>
                  <div className="mb-1 text-[14.5px] font-semibold text-inkstrong">{e.subject}</div>
                  {e.summary && <div className="text-[13.5px] leading-normal text-ink2">{e.summary}</div>}
                  <div className="mt-2.5 flex gap-2.5">
                    {e.actions.map((act, i) => (
                      <button
                        key={i}
                        className="rounded-[8px] border border-[#E7E0D2] bg-[#F8F5EF] px-3 py-1.5 text-[12px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:bg-card hover:text-[#3F3A32]"
                      >
                        {act}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-3 text-[13px] text-ink3">No mail yet — CC your agent address to route email here.</p>
            )}
          </Card>

          <Card className="px-5 pb-4 pt-6 sm:px-[26px]">
            <SectionHeader index="08" title="People" />
            <div className="mb-1.5 mt-1 text-[12px] text-ink3">Profiles I build quietly from your emails & chats.</div>
            {d.people.length ? (
              d.people.map((p) => (
                <Link
                  key={p.id}
                  href="/people"
                  className="flex items-center gap-3 border-t border-line2 py-[11px] no-underline"
                >
                  <Avatar name={p.name} area={p.area} />
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold text-inkstrong">{p.name}</div>
                    <div className="text-[12px] text-ink3">
                      {p.role}
                      {p.area ? ` · ${p.area}` : ""}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="py-3 text-[13px] text-ink3">No contacts yet.</p>
            )}
          </Card>
        </div>

        <div className="mt-11 text-center text-[14px] text-ink3">
          That's the picture. Message me on Telegram and I'll take it from here.
        </div>
      </div>
    </div>
  );
}
