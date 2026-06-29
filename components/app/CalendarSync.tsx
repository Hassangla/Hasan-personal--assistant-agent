"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CaldavAccount = { id: string; username: string; lastStatus: string | null };

// Calendar-linking hub:
//  • OUT     — subscribe Google/iOS to the agent's read-only .ics feed.
//  • IN      — paste any published .ics URL (Google secret iCal, Outlook, etc.).
//  • CalDAV  — connect one or MORE accounts directly (iCloud/Fastmail/Yahoo/custom).
export function CalendarSync({
  httpsUrl,
  webcalUrl,
  caldavAccounts,
}: {
  httpsUrl: string;
  webcalUrl: string;
  caldavAccounts: CaldavAccount[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  // IN — import by URL
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // CalDAV connect
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [provider, setProvider] = useState("icloud");
  const [server, setServer] = useState("");
  const [cbusy, setCbusy] = useState(false);
  const [cmsg, setCmsg] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  async function importCal(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/import-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`Imported ${j.imported ?? 0} event(s). It’ll keep syncing automatically.`);
        setUrl("");
        router.refresh();
      } else {
        setMsg(j.error ?? "Couldn’t import that URL.");
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim() || cbusy) return;
    setCbusy(true);
    setCmsg(null);
    try {
      const res = await fetch("/api/caldav/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, provider, server }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setCmsg(`Connected · ${j.calendars} calendar(s) · imported ${j.imported} event(s).`);
        setUsername("");
        setPassword("");
        router.refresh();
      } else {
        setCmsg(j.error ?? "Couldn’t connect.");
      }
    } catch {
      setCmsg("Network error.");
    } finally {
      setCbusy(false);
    }
  }

  async function disconnect(accountId: string) {
    if (cbusy) return;
    setCbusy(true);
    setCmsg(null);
    try {
      const res = await fetch("/api/caldav/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disconnect: true, accountId }),
      });
      if (res.ok) router.refresh();
      else setCmsg("Couldn’t disconnect.");
    } catch {
      setCmsg("Network error.");
    } finally {
      setCbusy(false);
    }
  }

  const inputCls =
    "min-w-0 flex-1 basis-full rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12.5px] text-ink outline-none sm:basis-auto";
  const primaryBtn =
    "rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white shadow-accent transition hover:brightness-105 disabled:opacity-50";

  return (
    <div className="mt-4 rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
      {/* OUT */}
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">📲 Sync to your phone</div>
      <p className="m-0 mb-2.5 text-[12.5px] leading-normal text-ink2">
        Subscribe in Google Calendar (&ldquo;From URL&rdquo;) or Apple/iOS (&ldquo;Add Subscribed Calendar&rdquo;).
        Read-only and auto-refreshing.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={webcalUrl}
          className="rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white no-underline shadow-accent transition hover:brightness-105"
        >
          Add to Apple Calendar
        </a>
        <button
          onClick={copy}
          className="rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:text-[#3F3A32]"
        >
          {copied ? "Copied ✓" : "Copy feed URL"}
        </button>
      </div>

      {/* IN — by URL */}
      <div className="mt-3 border-t border-line2 pt-3">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">⤵ Import by link</div>
        <p className="m-0 mb-2 text-[12.5px] leading-normal text-ink2">
          Paste any published <span className="font-mono">.ics</span>/<span className="font-mono">webcal</span> link —
          one per account. <b>Google:</b> Settings → that calendar → &ldquo;Secret address in iCal format.&rdquo;
        </p>
        <form onSubmit={importCal} className="flex flex-wrap items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="webcal://… or https://…/basic.ics"
            className={inputCls}
          />
          <button type="submit" disabled={busy || !url.trim()} className={primaryBtn}>
            {busy ? "Importing…" : "Import"}
          </button>
        </form>
        {msg && <p className="m-0 mt-1.5 text-[12px] text-ink2">{msg}</p>}
      </div>

      {/* CalDAV — multiple accounts */}
      <div className="mt-3 border-t border-line2 pt-3">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">🔗 Connect accounts (CalDAV)</div>

        {caldavAccounts.length > 0 && (
          <ul className="mb-2 space-y-1">
            {caldavAccounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="font-semibold text-good">✓ {a.username}</span>
                {a.lastStatus && <span className="font-mono text-[10px] text-inkfaint">{a.lastStatus}</span>}
                <button
                  onClick={() => disconnect(a.id)}
                  disabled={cbusy}
                  className="ml-auto rounded-[7px] border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-ink2 transition hover:border-danger hover:text-danger disabled:opacity-50"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="m-0 mb-2 text-[12.5px] leading-normal text-ink2">
          Add an account directly with an{" "}
          <a href="https://account.apple.com" target="_blank" rel="noreferrer" className="text-accent underline">
            app-specific password
          </a>{" "}
          (iCloud/Fastmail/Yahoo). Stored encrypted. <i>Google uses the link box above, not this.</i>
        </p>
        <form onSubmit={connect} className="flex flex-wrap items-center gap-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-[8px] border border-line bg-card px-2 py-1.5 text-[12.5px] text-ink outline-none"
          >
            <option value="icloud">iCloud</option>
            <option value="fastmail">Fastmail</option>
            <option value="yahoo">Yahoo</option>
            <option value="custom">Other…</option>
          </select>
          <input
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="email"
            className={inputCls}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="app-specific password"
            className={inputCls}
          />
          {provider === "custom" && (
            <input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="https://caldav.your-provider.com"
              className={inputCls}
            />
          )}
          <button type="submit" disabled={cbusy || !username.trim() || !password.trim()} className={primaryBtn}>
            {cbusy ? "Connecting…" : caldavAccounts.length ? "Add account" : "Connect"}
          </button>
        </form>
        {cmsg && <p className="m-0 mt-1.5 text-[12px] text-ink2">{cmsg}</p>}
      </div>
    </div>
  );
}
