import { getDashboardData } from "@/lib/dashboard/queries";
import { Section, Empty, Pill, Dot, type Tone } from "@/components/dashboard/ui";
import { CaptureBar } from "@/components/dashboard/CaptureBar";
import { CompletableTask } from "@/components/dashboard/CompletableTask";
import { Clock } from "@/components/dashboard/Clock";
import { USER_TIMEZONE } from "@/lib/config";

// Read-only model: rendered per-request from Supabase. NEVER calls the model on
// load — the only model call is submitting the capture line (a user action).
export const dynamic = "force-dynamic";

function inTz(opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    hour12: false,
    ...opts,
  }).format(new Date());
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: USER_TIMEZONE,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function greeting(): string {
  const h = Number(inTz({ hour: "2-digit" }));
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((w) => w[0]?.toUpperCase() ?? "").join("") || "·";
}

// Status → glyph + pill tone + label for the ledger.
const LEDGER: Record<string, { glyph: string; tone: Tone; label: string }> = {
  done: { glyph: "✓", tone: "good", label: "done" },
  dropped: { glyph: "⊘", tone: "muted", label: "dropped" },
  snoozed: { glyph: "⏸", tone: "warm", label: "postponed" },
  escalated: { glyph: "‼", tone: "hot", label: "escalated" },
  reminded: { glyph: "•", tone: "warm", label: "reminded" },
  open: { glyph: "○", tone: "cool", label: "open" },
};

// Static class strings so Tailwind's JIT picks them up.
const GLYPH_COLOR: Record<Tone, string> = {
  good: "text-good",
  hot: "text-hot",
  warm: "text-warm",
  cool: "text-cool",
  muted: "text-faint",
};

export default async function Dashboard() {
  const d = await getDashboardData();
  const longDate = inTz({ weekday: "long", day: "numeric", month: "long" });
  const doneCount = d.ledger.filter((t) => t.status === "done").length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.22em]">
            <span className="text-text">PERSONAL AGENT</span>
            <span className="text-faint">// v0.2</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            <span className="hidden sm:inline">{longDate}</span>
            <span className="inline-flex items-center gap-1.5 text-good">
              <Dot tone="good" />
              online
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* SESSION */}
        <section className="mb-4 rounded-xl border border-border bg-panel/70 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-[0.22em] text-faint">
                01 // SESSION
              </div>
              <h1 className="mt-2 font-serif text-3xl italic leading-tight text-text">
                {greeting()}
              </h1>
              <p className="mt-1.5 text-sm text-muted">
                Read-only window — you act through Telegram or the capture line.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Clock tz={USER_TIMEZONE} />
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                {USER_TIMEZONE.replace("_", " ")}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-panel2 px-3.5 py-2.5">
            <CaptureBar />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* TODAY */}
          <Section index="02" label="Today" meta={`${d.today.length} open`} className="lg:col-span-2">
            {d.today.length ? (
              <ul className="divide-y divide-border/70">
                {d.today.map((t, i) => (
                  <CompletableTask
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    leadBadge={`P${i + 1}`}
                    tags={t.urgency === "high" ? [{ tone: "hot", label: "urgent" }] : []}
                    when={fmtWhen(t.due_at) || "—"}
                    className="py-2.5 first:pt-0 last:pb-0"
                  />
                ))}
              </ul>
            ) : (
              <Empty>No open tasks — capture something above.</Empty>
            )}
          </Section>

          {/* FOLLOW-UPS */}
          <Section index="03" label="Follow-ups" meta="in flight">
            {d.followups.length ? (
              <ul className="space-y-2.5">
                {d.followups.map((t) => (
                  <CompletableTask
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    tags={[{ tone: t.status === "escalated" ? "hot" : "warm", label: t.status }]}
                    counter={`×${t.nudge_count}`}
                  />
                ))}
              </ul>
            ) : (
              <Empty>Nothing being chased.</Empty>
            )}
          </Section>

          {/* TASK LEDGER — executed vs not, with reasons */}
          <Section
            index="04"
            label="Task Ledger"
            meta={`${doneCount} done · ${d.ledger.length} recent`}
            className="lg:col-span-3"
          >
            {d.ledger.length ? (
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {d.ledger.map((t) => {
                  const s = LEDGER[t.status] ?? LEDGER.open!;
                  const when =
                    t.status === "done" ? t.completed_at : t.due_at;
                  return (
                    <li key={t.id} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 font-mono ${GLYPH_COLOR[s.tone]}`}>
                        {s.glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`min-w-0 flex-1 truncate text-sm ${
                              t.status === "done" || t.status === "dropped"
                                ? "text-muted line-through decoration-faint"
                                : "text-text"
                            }`}
                          >
                            {t.title}
                          </span>
                          <Pill tone={s.tone}>{s.label}</Pill>
                          {t.delegated_to && <Pill tone="cool">→ {t.delegated_to}</Pill>}
                          <span className="shrink-0 font-mono text-[10px] text-faint">
                            {fmtWhen(when)}
                          </span>
                        </div>
                        {t.reason && (
                          <div className="mt-0.5 truncate text-xs text-muted">
                            <span className="text-faint">reason:</span> {t.reason}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No tasks yet — once you capture some, their outcomes show here.</Empty>
            )}
          </Section>

          {/* AREAS — open tasks grouped by life area */}
          <Section index="05" label="Areas" meta="open tasks by life area" className="lg:col-span-3">
            {d.areas.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.areas.map((a) => (
                  <div key={a.id} className="rounded-lg border border-border bg-panel2/50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                        {a.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-faint">
                        {a.tasks.length}
                      </span>
                    </div>
                    {a.tasks.length ? (
                      <ul className="space-y-1.5">
                        {a.tasks.slice(0, 6).map((t) => (
                          <CompletableTask
                            key={t.id}
                            id={t.id}
                            title={t.title}
                            when={t.due_at ? fmtWhen(t.due_at) : undefined}
                          />
                        ))}
                        {a.tasks.length > 6 && (
                          <li className="font-mono text-[10px] text-faint">
                            +{a.tasks.length - 6} more
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-faint">no open tasks</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty>No areas seeded.</Empty>
            )}
          </Section>

          {/* HABITS */}
          <Section index="06" label="Habits" meta="streaks">
            {d.habits.length ? (
              <ul className="space-y-2.5">
                {d.habits.map((h, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={h.today ? "text-good" : "text-faint"}>
                      {h.today ? "◉" : "○"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text">
                      {h.name}
                    </span>
                    <span className="font-mono text-[11px] text-muted">{h.streak}d</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No habits tracked.</Empty>
            )}
          </Section>

          {/* EXPENSES */}
          <Section index="07" label="Expenses" meta="month to date">
            {d.expenses.totals.length ? (
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                {d.expenses.totals.map((t, i) => (
                  <div key={i}>
                    <span className="font-mono text-xl tabular-nums text-text">
                      {t.total.toLocaleString()}
                    </span>{" "}
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      {t.currency}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>No expenses this month.</Empty>
            )}
            {d.expenses.recent.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                {d.expenses.recent.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3 text-xs">
                    <span className="truncate text-muted">
                      {e.category ?? e.note ?? "expense"}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-faint">
                      {Number(e.amount).toLocaleString()} {e.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* PEOPLE */}
          <Section index="08" label="People" meta="reconnect">
            {d.people.length ? (
              <ul className="space-y-2.5">
                {d.people.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-panel2 font-mono text-[10px] text-muted">
                      {initials(p.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text">
                      {p.name}
                    </span>
                    <Pill tone="warm">due</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No one&apos;s overdue for a touch.</Empty>
            )}
          </Section>

          {/* REVIEW */}
          <Section index="09" label="Review" meta="weekly">
            <Empty>The agent-drafted weekly review lands in Part 3.</Empty>
          </Section>

          {/* PLANS */}
          <Section index="10" label="Plans" meta="short · medium · long" className="lg:col-span-3">
            {d.plans.length ? (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {d.plans.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <Pill tone={p.horizon === "long" ? "cool" : p.horizon === "medium" ? "warm" : "good"}>
                      {p.horizon}
                    </Pill>
                    <span className="min-w-0 flex-1 truncate text-text">{p.title}</span>
                    {p.next_review_at && (
                      <span className="shrink-0 font-mono text-[10px] text-faint">
                        review {fmtWhen(p.next_review_at)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No plans yet — ask me to draft a short, medium, or long-term plan.</Empty>
            )}
          </Section>

          {/* MAIL */}
          <Section index="11" label="Mail" meta="agent inbox" className="lg:col-span-3">
            {d.mail.length ? (
              <ul className="space-y-2.5">
                {d.mail.map((m) => (
                  <li key={m.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-cool">✉</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-text">{m.subject}</span>
                        {m.area && <Pill tone="muted">{m.area}</Pill>}
                        <span className="shrink-0 font-mono text-[10px] text-faint">
                          {fmtWhen(m.received_at)}
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted">
                        {m.from}
                        {m.summary ? ` — ${m.summary}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No mail yet — CC your agent address to route email here.</Empty>
            )}
          </Section>
        </div>

        <footer className="mt-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          <span>Personal Agent · read-only</span>
          <span>act via Telegram</span>
        </footer>
      </main>
    </div>
  );
}
