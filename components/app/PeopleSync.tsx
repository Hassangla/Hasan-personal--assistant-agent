"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AREA_META } from "@/lib/areas";
import { toast } from "@/components/app/Toast";

// Live iCloud Contacts sync card: one-tap connect (reusing the calendar's
// iCloud credential), status line, and the review inbox — new contacts from
// the phone wait here for approval so the CRM stays curated.

type PendingRow = { id: string; name: string; org: string | null; title: string | null; email: string | null };
type Props = {
  connected: { username: string; lastStatus: string | null } | null;
  hasCalendarICloud: boolean;
  pending: PendingRow[];
  pendingTotal: number;
};

export function PeopleSync({ connected, hasCalendarICloud, pending, pendingTotal }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [manual, setManual] = useState(false);

  async function connect(useCalendar: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/people/carddav", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(useCalendar ? { useCalendarAccount: true } : { username, password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.error ?? "Couldn't connect", "err");
        return;
      }
      toast(`iCloud Contacts connected ✓ ${j.pending} awaiting review, ${j.enriched} enriched`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const [bulk, setBulk] = useState<string | null>(null);

  // Batch-loop until the queue drains — each request stays inside the
  // serverless time budget; progress lands as toasts.
  async function bulkRun(action: "approve_batch" | "dismiss_batch") {
    const verb = action === "approve_batch" ? "Adding" : "Dismissing";
    if (bulk) return;
    if (!window.confirm(action === "approve_batch"
      ? `Add all ${pendingTotal} pending contacts to the CRM? Areas are auto-suggested where possible.`
      : `Dismiss all ${pendingTotal} pending contacts? They stay in iCloud and won't be asked about again.`)) return;
    setBulk(action);
    try {
      let remaining = pendingTotal;
      let done = 0;
      while (remaining > 0) {
        const res = await fetch("/api/people/carddav/inbox", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, limit: 100 }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(j.error ?? "Bulk action failed — you can retry, it resumes", "err");
          break;
        }
        done += j.processed ?? 0;
        remaining = j.remaining ?? 0;
        if (j.processed === 0) break;
        toast(`${verb}… ${done} done, ${remaining} left`);
      }
      toast(remaining === 0 ? `${verb === "Adding" ? "All added" : "All dismissed"} ✓` : `Stopped — ${remaining} left`);
      router.refresh();
    } finally {
      setBulk(null);
    }
  }

  async function act(id: string, action: "approve" | "dismiss") {
    if (busyRow) return;
    setBusyRow(id);
    try {
      const res = await fetch("/api/people/carddav/inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action, area: areas[id] || null }),
      });
      if (!res.ok) {
        toast("Action failed — try again", "err");
        return;
      }
      if (action === "approve") toast("Added to the CRM ✓");
      router.refresh();
    } finally {
      setBusyRow(null);
    }
  }

  const btn =
    "rounded-[9px] bg-accent px-3.5 py-2 text-[12.5px] font-bold text-white shadow-accent transition hover:brightness-105 disabled:opacity-50";
  const ghost =
    "rounded-[8px] border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:text-[#3F3A32] disabled:opacity-50";

  return (
    <div className="mb-5 rounded-[14px] border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink3">🔄 iCloud Contacts · live sync</span>
        {connected ? (
          <>
            <span className="text-[12.5px] font-semibold text-good">✓ {connected.username}</span>
            {connected.lastStatus && <span className="font-mono text-[10px] text-inkfaint">{connected.lastStatus}</span>}
            <button
              onClick={async () => {
                await fetch("/api/people/carddav", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ disconnect: true }),
                });
                router.refresh();
              }}
              className={`ml-auto ${ghost} hover:border-danger hover:text-danger`}
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <span className="text-[12px] text-ink3">
              New contacts saved on your iPhone appear here for review; known people update automatically.
            </span>
            <span className="ml-auto flex items-center gap-2">
              {hasCalendarICloud && (
                <button onClick={() => connect(true)} disabled={busy} className={btn}>
                  {busy ? "Connecting…" : "Connect with calendar's iCloud account"}
                </button>
              )}
              <button onClick={() => setManual((v) => !v)} className={ghost}>
                {hasCalendarICloud ? "other account" : "connect"}
              </button>
            </span>
          </>
        )}
      </div>

      {!connected && manual && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            connect(false);
          }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Apple ID email"
            className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12.5px] text-ink outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="app-specific password"
            className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12.5px] text-ink outline-none"
          />
          <button type="submit" disabled={busy || !username.trim() || !password.trim()} className={btn}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </form>
      )}

      {connected && pending.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink2">
            <span>
              <b className="text-inkstrong">{pendingTotal}</b> new from iCloud awaiting review
              {pendingTotal > pending.length ? ` (showing first ${pending.length})` : ""}
            </span>
            <span className="ml-auto flex gap-2">
              <button
                onClick={() => bulkRun("approve_batch")}
                disabled={!!bulk}
                className={`${ghost} text-good hover:border-good`}
              >
                {bulk === "approve_batch" ? "Adding…" : `✓ Add all ${pendingTotal}`}
              </button>
              <button onClick={() => bulkRun("dismiss_batch")} disabled={!!bulk} className={ghost}>
                {bulk === "dismiss_batch" ? "Dismissing…" : "✕ Dismiss all"}
              </button>
            </span>
          </div>
          <div className="max-h-[300px] overflow-y-auto rounded-[10px] border border-line2">
            {pending.map((p) => (
              <div key={p.id} className={`flex items-center gap-2.5 border-b border-line2 px-3 py-2 ${busyRow === p.id ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-inkstrong">{p.name}</div>
                  <div className="truncate text-[11.5px] text-ink3">
                    {[p.title, p.org, p.email].filter(Boolean).join(" · ") || "no details"}
                  </div>
                </div>
                <select
                  value={areas[p.id] ?? ""}
                  onChange={(e) => setAreas((a) => ({ ...a, [p.id]: e.target.value }))}
                  className="shrink-0 rounded-[7px] border border-line bg-card px-1.5 py-1 text-[11px] text-ink2 outline-none"
                >
                  <option value="">area…</option>
                  {AREA_META.map((a) => (
                    <option key={a.slug} value={a.canonical}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <button onClick={() => act(p.id, "approve")} disabled={!!busyRow} className={`${ghost} text-good hover:border-good`}>
                  ✓ Add
                </button>
                <button onClick={() => act(p.id, "dismiss")} disabled={!!busyRow} className={ghost}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
