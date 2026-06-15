// Read-only landing. Part 0 deliberately ships no feature pages and NEVER calls
// the model on a page load (see spec pitfall #7). The dashboard read-model
// arrives in Part 2.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div className="rounded-xl border border-border bg-panel p-8">
        <h1 className="text-2xl font-semibold">Personal Agent</h1>
        <p className="mt-2 text-muted">
          The agent runs through Telegram and a cron heartbeat — not this page.
          You act through conversation; this dashboard is a read-only window.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-muted">
          <li>
            <span className="text-accent">Reactive:</span> Telegram message →{" "}
            <code>/api/telegram/webhook</code>
          </li>
          <li>
            <span className="text-accent">Proactive:</span> cron tick →{" "}
            <code>/api/agent/tick</code>
          </li>
        </ul>
        <p className="mt-6 text-xs text-muted">
          Foundation (Part 0) + capture &amp; follow-up engine (Part 1). The
          read-model dashboard is added in Part 2.
        </p>
      </div>
    </main>
  );
}
