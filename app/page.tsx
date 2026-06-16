import { getDashboardData } from "@/lib/dashboard/queries";
import { Card, Empty } from "@/components/dashboard/ui";
import { CaptureBox } from "@/components/CaptureBox";
import { USER_TIMEZONE } from "@/lib/config";

// Read-only model: rendered per-request from Supabase. NEVER calls the model on
// load — the only model call is when you submit the capture box (a user action).
export const dynamic = "force-dynamic";

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

export default async function Dashboard() {
  const d = await getDashboardData();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Personal Agent</h1>
        <p className="text-sm text-muted">
          Read-only window · you act through Telegram or the capture box.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Today" hint="top tasks">
          {d.today.length ? (
            <ul className="space-y-2">
              {d.today.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {fmtWhen(t.due_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No open tasks — capture something below.</Empty>
          )}
        </Card>

        <Card title="Follow-ups in flight" hint="reminded / escalated">
          {d.followups.length ? (
            <ul className="space-y-2">
              {d.followups.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate">{t.title}</span>
                  <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-xs text-muted">
                    {t.status} · nudge {t.nudge_count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing being chased right now.</Empty>
          )}
        </Card>

        <Card title="Five Areas" hint="today's check-in">
          {d.areas.length ? (
            <ul className="space-y-2">
              {d.areas.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="text-white">{a.name}</span>
                  <span className="text-muted">
                    {" "}
                    — {a.checkin ?? "no check-in yet"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No areas seeded yet.</Empty>
          )}
        </Card>

        <Card title="Habits" hint="streaks">
          {d.habits.length ? (
            <ul className="space-y-2">
              {d.habits.map((h, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {h.today ? "✅" : "⬜"} {h.name}
                  </span>
                  <span className="text-xs text-muted">{h.streak}d streak</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No habits tracked yet.</Empty>
          )}
        </Card>

        <Card title="Expenses" hint="month to date">
          <div className="mb-2 flex flex-wrap gap-2">
            {d.expenses.totals.length ? (
              d.expenses.totals.map((t, i) => (
                <span
                  key={i}
                  className="rounded bg-bg px-2 py-1 text-sm font-medium"
                >
                  {t.total.toLocaleString()} {t.currency}
                </span>
              ))
            ) : (
              <Empty>No expenses this month.</Empty>
            )}
          </div>
          {d.expenses.recent.length > 0 && (
            <ul className="space-y-1">
              {d.expenses.recent.map((e, i) => (
                <li key={i} className="flex justify-between gap-3 text-xs text-muted">
                  <span className="truncate">{e.category ?? e.note ?? "expense"}</span>
                  <span className="shrink-0">
                    {Number(e.amount).toLocaleString()} {e.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="People to reconnect" hint="due soon">
          {d.people.length ? (
            <ul className="space-y-2">
              {d.people.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {fmtWhen(p.next_touch_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No one's overdue for a touch.</Empty>
          )}
        </Card>

        <Card title="Last week's review" hint="Part 3">
          <Empty>The agent-drafted weekly review arrives in Part 3.</Empty>
        </Card>
      </div>

      <CaptureBox />
    </main>
  );
}
