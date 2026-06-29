import { getDashboardData } from "@/lib/dashboard/queries";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { Clock } from "@/components/app/Clock";
import { CaptureBar } from "@/components/app/CaptureBar";
import { CompletableTaskRow } from "@/components/app/CompletableTaskRow";
import { Card, SectionHeader, Eyebrow, AreaTag, Avatar } from "@/components/app/ui";
import { CalendarSync } from "@/components/app/CalendarSync";
import { headers } from "next/headers";
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
  const host = (await headers()).get("host") ?? "";
  const calHttps = `https://${host}${d.calendarFeedPath}`;
  const calWebcal = `webcal://${host}${d.calendarFeedPath}`;
  const metrics = [
    { label: "Open priorities", value: d.metrics.openPriorities },
    { label: "I'm chasing you", value: d.metrics.chasingYou },
    { label: "Chasing others", value: d.metrics.chasingOthers },
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

        {/* MAIN GRID */}
        <div className="mt-[34px] grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.55fr_1fr]">
          {/* TODAY */}
          <Card className="px-5 pb-3.5 pt-6 sm:px-7">
            <SectionHeader index="02" title="Today" meta={`${d.today.length} priorities`} />
            <div className="mt-1.5">
              {d.today.length ? (
                d.today.map((t) => (
                  <CompletableTaskRow
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    layout="today"
                    badge={t.priority}
                    area={t.area}
                    state={{ color: t.state.color, label: t.state.label }}
                  />
                ))
              ) : (
                <p className="py-6 text-center text-[14px] text-ink3">No open priorities — capture something above.</p>
              )}
            </div>
          </Card>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-6">
            {/* LIFE AREAS */}
            <Card className="px-5 pb-3.5 pt-6 sm:px-6">
              <SectionHeader index="03" title="Life areas" meta="7" />
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
              <SectionHeader index="04" title="Heartbeat" meta="per-minute" />
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

        {/* UPCOMING MEETINGS */}
        <div className="mt-9">
          <Card className="px-5 pb-5 pt-6 sm:px-7">
            <SectionHeader index="✦" title="Upcoming" note="— meetings & calendar" meta={`${d.meetings.length} scheduled`} />
            <div className="mt-2">
              {d.meetings.length ? (
                d.meetings.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 border-t border-line2 py-2.5">
                    <span className="text-[15px]">🗓</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-inkstrong">{m.title}</span>
                    {m.area && <AreaTag area={m.area} />}
                    <span className="shrink-0 font-mono text-[11px] text-ink3">{m.startText}</span>
                  </div>
                ))
              ) : (
                <p className="py-3 text-[13px] text-ink3">
                  No meetings scheduled — tell me on Telegram (&ldquo;meeting with Marina tomorrow 3pm&rdquo;) and it&apos;ll
                  appear here and on your synced calendar.
                </p>
              )}
            </div>
            <CalendarSync httpsUrl={calHttps} webcalUrl={calWebcal} caldavAccounts={d.caldavAccounts} />
          </Card>
        </div>

        {/* FOLLOWING UP */}
        <div className="mt-9">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[12px] tracking-[0.1em] text-inkfaint">05</span>
            <h2 className="m-0 font-display text-[21px] font-bold tracking-[-0.01em] text-ink">Following up</h2>
            <span className="hidden text-[13px] text-ink3 sm:inline">— the engine that nudges until things resolve</span>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="px-5 pb-3.5 pt-[22px] sm:px-[26px]">
              <div className="mb-2 flex items-center gap-[9px]">
                <span className="h-2 w-2 rounded-full bg-amber" />
                <h3 className="m-0 text-[14px] font-bold text-inkstrong">I'm chasing you</h3>
              </div>
              {d.chasingYou.length ? (
                d.chasingYou.map((c) => (
                  <CompletableTaskRow
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    layout="chaseYou"
                    area={c.area}
                    note={c.note}
                    noteColor={c.noteColor}
                  />
                ))
              ) : (
                <p className="py-3 text-[13px] text-ink3">Nothing waiting on you.</p>
              )}
            </Card>

            <Card className="px-5 pb-3.5 pt-[22px] sm:px-[26px]">
              <div className="mb-2 flex items-center gap-[9px]">
                <span className="h-2 w-2 rounded-full bg-blue" />
                <h3 className="m-0 text-[14px] font-bold text-inkstrong">I'm chasing others</h3>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-inkfaint">
                  delegated
                </span>
              </div>
              {d.chasingOthers.length ? (
                d.chasingOthers.map((c) => (
                  <CompletableTaskRow
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    layout="chaseOthers"
                    area={c.area}
                    who={c.who}
                    note={c.note}
                    noteColor={c.noteColor}
                  />
                ))
              ) : (
                <p className="py-3 text-[13px] text-ink3">Nothing delegated right now.</p>
              )}
            </Card>
          </div>
        </div>

        {/* INBOX + PEOPLE */}
        <div className="mt-9 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="px-5 py-6 sm:px-7">
            <SectionHeader index="06" title="Inbox" note="— triaged, awaiting your OK" />
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
            <SectionHeader index="07" title="People" />
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

        {/* PLANS */}
        <div className="mt-9">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[12px] tracking-[0.1em] text-inkfaint">08</span>
            <h2 className="m-0 font-display text-[21px] font-bold tracking-[-0.01em] text-ink">Plans</h2>
            <span className="hidden text-[13px] text-ink3 sm:inline">— reviewed on a rhythm</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {d.plans.map((pl) => (
              <Card key={pl.horizon} className="rounded-[18px] px-5 py-5 sm:px-[22px]">
                <Eyebrow className="mb-1">{pl.horizon}</Eyebrow>
                <div className="mb-3 text-[13px] text-ink3">{pl.window}</div>
                {pl.items.length ? (
                  pl.items.map((it, i) => (
                    <div key={i} className="flex items-start gap-2.5 border-t border-[#F4EFE5] py-[7px]">
                      <span className="font-mono text-[13px] text-[#CFC6B3]">—</span>
                      <span className="text-[14px] font-medium leading-snug text-inkstrong">{it}</span>
                    </div>
                  ))
                ) : (
                  <div className="py-2 text-[13px] text-inkfaint">Nothing filed yet.</div>
                )}
              </Card>
            ))}
          </div>
        </div>

        <div className="mt-11 text-center text-[14px] text-ink3">
          That's the picture. Message me on Telegram and I'll take it from here.
        </div>
      </div>
    </div>
  );
}
