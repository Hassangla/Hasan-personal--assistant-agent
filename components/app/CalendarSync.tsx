"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CaldavAccount = { id: string; username: string; lastStatus: string | null };
type CalSource = { id: string; label: string | null; url: string; lastStatus: string | null };

type Method = "ics" | "caldav";
type Provider = {
  key: string;
  name: string;
  emoji: string;
  method: Method | "both";
  caldavProvider?: string;
  steps: string[];
  urlPlaceholder?: string;
  note?: string;
};

// Every provider the user might have. ICS-link providers (Google, Outlook,
// Proton, .edu) publish a read-only "secret" URL; CalDAV providers (iCloud,
// Yahoo) connect directly with an app-specific password. "Other" offers both.
const PROVIDERS: Provider[] = [
  {
    key: "google",
    name: "Google · Gmail",
    emoji: "📅",
    method: "ics",
    steps: [
      "Open Google Calendar on the web (calendar.google.com).",
      "Hover the calendar on the left → ⋮ → “Settings and sharing”.",
      "Scroll to “Integrate calendar” → copy the “Secret address in iCal format”.",
      "Paste it below.",
    ],
    urlPlaceholder: "https://calendar.google.com/calendar/ical/…/basic.ics",
  },
  {
    key: "icloud",
    name: "iCloud · Apple",
    emoji: "",
    method: "caldav",
    caldavProvider: "icloud",
    steps: [
      "Go to account.apple.com → “Sign-In & Security” → “App-Specific Passwords”.",
      "Generate one — it looks like xxxx-xxxx-xxxx-xxxx.",
      "Enter your Apple ID email + that password below.",
    ],
  },
  {
    key: "yahoo",
    name: "Yahoo",
    emoji: "📨",
    method: "caldav",
    caldavProvider: "yahoo",
    steps: [
      "Yahoo → “Account Security” → “Generate app password” (choose “Other”).",
      "Enter your Yahoo email + that generated password below.",
    ],
  },
  {
    key: "outlook",
    name: "Outlook · Microsoft",
    emoji: "📧",
    method: "ics",
    steps: [
      "Outlook.com → Calendar → Settings (gear) → “Shared calendars”.",
      "Under “Publish a calendar”, pick the calendar + “Can view all details” → Publish.",
      "Copy the ICS link (the one ending in .ics, not the HTML link).",
      "Paste it below.",
    ],
    urlPlaceholder: "https://outlook.office365.com/owa/calendar/…/calendar.ics",
  },
  {
    key: "proton",
    name: "Proton",
    emoji: "🔒",
    method: "ics",
    steps: [
      "Proton Calendar → Settings → your calendar → “Share”.",
      "Turn on “Share with anyone” to generate a public link.",
      "Copy the link and paste it below.",
    ],
    note: "Public share links require a paid Proton plan.",
    urlPlaceholder: "https://calendar.proton.me/api/calendar/…/ics",
  },
  {
    key: "university",
    name: "University · .edu",
    emoji: "🎓",
    method: "ics",
    steps: [
      "Most .edu calendars run on Google Workspace or Outlook.",
      "In your school webmail, follow the Google or Outlook steps to get the secret iCal / published ICS link.",
      "Paste it below.",
    ],
    urlPlaceholder: "https://…/basic.ics",
  },
  {
    key: "other",
    name: "Other",
    emoji: "➕",
    method: "both",
    steps: [
      "Any provider with a published .ics/webcal link works via “Link”.",
      "Any CalDAV server works via “Connect” (email + app-specific password).",
    ],
    urlPlaceholder: "webcal://… or https://…/calendar.ics",
  },
];

function hostOf(url: string): string {
  try {
    return new URL(url.replace(/^webcal:\/\//i, "https://")).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

// Calendar-linking hub: guided per-provider connection, a unified list of every
// linked calendar (ICS + CalDAV) with disconnect, and the read-only feed out to
// the user's phone.
export function CalendarSync({
  httpsUrl,
  webcalUrl,
  caldavAccounts,
  sources,
}: {
  httpsUrl: string;
  webcalUrl: string;
  caldavAccounts: CaldavAccount[];
  sources: CalSource[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [sel, setSel] = useState<string>("google");
  const [otherMethod, setOtherMethod] = useState<Method>("ics");

  // ICS import
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // CalDAV connect
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [cbusy, setCbusy] = useState(false);
  const [cmsg, setCmsg] = useState<string | null>(null);

  const provider = PROVIDERS.find((p) => p.key === sel) ?? PROVIDERS[0]!;
  const activeMethod: Method = provider.method === "both" ? otherMethod : provider.method;

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
        body: JSON.stringify({ url, label: provider.key === "other" ? "" : provider.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`Linked · imported ${j.imported ?? 0} event(s). It’ll keep syncing automatically.`);
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
    const caldavProvider = provider.method === "both" ? "custom" : provider.caldavProvider ?? "icloud";
    try {
      const res = await fetch("/api/caldav/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, provider: caldavProvider, server }),
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

  async function disconnectCaldav(accountId: string) {
    if (cbusy) return;
    setCbusy(true);
    try {
      const res = await fetch("/api/caldav/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disconnect: true, accountId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setCbusy(false);
    }
  }

  async function disconnectSource(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/import-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disconnect: true, id }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "min-w-0 flex-1 basis-full rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12.5px] text-ink outline-none sm:basis-auto";
  const primaryBtn =
    "rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white shadow-accent transition hover:brightness-105 disabled:opacity-50";
  const disc =
    "ml-auto rounded-[7px] border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-ink2 transition hover:border-danger hover:text-danger disabled:opacity-50";

  const linkedCount = caldavAccounts.length + sources.length;

  return (
    <div className="mt-4 space-y-3">
      {/* CONNECTED */}
      {linkedCount > 0 && (
        <div className="rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">
            ✓ Linked calendars ({linkedCount})
          </div>
          <ul className="space-y-1.5">
            {caldavAccounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="font-semibold text-good">{a.username}</span>
                <span className="rounded-[5px] bg-line2 px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink3">CalDAV</span>
                {a.lastStatus && <span className="font-mono text-[10px] text-inkfaint">{a.lastStatus}</span>}
                <button onClick={() => disconnectCaldav(a.id)} disabled={cbusy} className={disc}>
                  Disconnect
                </button>
              </li>
            ))}
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="font-semibold text-good">{s.label || hostOf(s.url)}</span>
                <span className="rounded-[5px] bg-line2 px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink3">Link</span>
                {s.lastStatus && <span className="font-mono text-[10px] text-inkfaint">{s.lastStatus}</span>}
                <button onClick={() => disconnectSource(s.id)} disabled={busy} className={disc}>
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* LINK A CALENDAR */}
      <div className="rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">➕ Link a calendar</div>

        {/* provider tiles */}
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => {
            const on = p.key === sel;
            return (
              <button
                key={p.key}
                onClick={() => {
                  setSel(p.key);
                  setMsg(null);
                  setCmsg(null);
                }}
                className={`rounded-[9px] border px-2.5 py-1.5 text-[12px] font-semibold transition ${
                  on
                    ? "border-accent bg-accent text-white shadow-accent"
                    : "border-line bg-card text-ink2 hover:border-[#CFC6B3] hover:text-[#3F3A32]"
                }`}
              >
                {p.emoji && <span className="mr-1">{p.emoji}</span>}
                {p.name}
              </button>
            );
          })}
        </div>

        {/* "other" method toggle */}
        {provider.method === "both" && (
          <div className="mt-2.5 flex gap-1.5">
            {(["ics", "caldav"] as Method[]).map((mth) => (
              <button
                key={mth}
                onClick={() => setOtherMethod(mth)}
                className={`rounded-[7px] border px-2.5 py-1 text-[11px] font-semibold transition ${
                  otherMethod === mth ? "border-ink3 bg-card text-ink" : "border-line bg-transparent text-ink3"
                }`}
              >
                {mth === "ics" ? "Link (ICS URL)" : "Connect (CalDAV)"}
              </button>
            ))}
          </div>
        )}

        {/* steps */}
        {provider.steps.length > 0 && (
          <ol className="mt-2.5 space-y-1 pl-0">
            {provider.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-normal text-ink2">
                <span className="font-mono text-[11px] text-accent">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}
        {provider.note && <p className="m-0 mt-1.5 text-[11.5px] italic text-inkfaint">{provider.note}</p>}

        {/* action */}
        {activeMethod === "ics" ? (
          <form onSubmit={importCal} className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={provider.urlPlaceholder ?? "https://…/basic.ics"}
              className={inputCls}
            />
            <button type="submit" disabled={busy || !url.trim()} className={primaryBtn}>
              {busy ? "Linking…" : "Link calendar"}
            </button>
            {msg && <p className="m-0 basis-full text-[12px] text-ink2">{msg}</p>}
          </form>
        ) : (
          <form onSubmit={connect} className="mt-2.5 flex flex-wrap items-center gap-2">
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
            {provider.method === "both" && (
              <input
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="https://caldav.your-provider.com"
                className={inputCls}
              />
            )}
            <button type="submit" disabled={cbusy || !username.trim() || !password.trim()} className={primaryBtn}>
              {cbusy ? "Connecting…" : "Connect"}
            </button>
            <p className="m-0 basis-full text-[11px] text-inkfaint">Password is validated, stored encrypted, and never shown again.</p>
            {cmsg && <p className="m-0 basis-full text-[12px] text-ink2">{cmsg}</p>}
          </form>
        )}
      </div>

      {/* SYNC OUT — to phone */}
      <div className="rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">📲 Sync the agent to your phone</div>
        <p className="m-0 mb-2.5 text-[12.5px] leading-normal text-ink2">
          Subscribe to the agent’s own calendar in Apple Calendar (“Add Subscribed Calendar”) or Google (“From URL”).
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
      </div>
    </div>
  );
}
