"use client";

import { useState } from "react";

// Two-way Apple Reminders setup: copyable sync endpoints + the exact iOS
// Shortcut recipe. Apple has no server API for Reminders, so a Shortcut on
// the phone is the bridge — it pulls platform tasks into Reminders and pushes
// phone-created reminders back, both in one run.
export function RemindersSync({ pullUrl, pushUrl }: { pullUrl: string; pushUrl: string }) {
  const [copied, setCopied] = useState<"pull" | "push" | null>(null);

  async function copy(kind: "pull" | "push", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  const step = "flex gap-2 text-[12.5px] leading-normal text-ink2";
  const num = "shrink-0 font-mono text-[11px] text-accent";
  const kbd = "rounded bg-line2 px-1 font-mono text-[11px] text-inkstrong";

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">🔁 How it works</div>
        <p className="m-0 text-[12.5px] leading-normal text-ink2">
          A small iPhone Shortcut syncs both ways whenever it runs: tasks you add here appear in a{" "}
          <b>“Personal Agent”</b> list in Apple Reminders, and reminders you add to your inbox list become real tasks
          here (with the agent’s follow-up nudging). Completing a synced reminder completes the task; tasks completed
          here get their reminders cleaned up. Apple offers no server API for Reminders, so your phone is the bridge —
          set the automation below and it stays in sync on its own.
        </p>
        <div className="mt-2.5 space-y-1.5">
          {(
            [
              ["pull", pullUrl, "Pull URL (platform → Reminders)"],
              ["push", pushUrl, "Push URL (Reminders → platform)"],
            ] as const
          ).map(([kind, url, label]) => (
            <div key={kind} className="flex flex-wrap items-center gap-2">
              <span className="w-full font-mono text-[10px] uppercase tracking-[0.08em] text-ink3 sm:w-auto sm:min-w-[240px]">
                {label}
              </span>
              <code className="min-w-0 flex-1 truncate rounded-[7px] border border-line bg-card px-2 py-1 font-mono text-[10.5px] text-ink2">
                {url}
              </code>
              <button
                onClick={() => copy(kind, url)}
                className="rounded-[8px] border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:text-[#3F3A32]"
              >
                {copied === kind ? "Copied ✓" : "Copy"}
              </button>
            </div>
          ))}
        </div>
        <p className="m-0 mt-2 text-[11px] text-inkfaint">
          These URLs are credentials — anyone with them can read/add your tasks. Keep them inside the Shortcut only.
        </p>
      </div>

      <details className="rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">
          📱 Build the Shortcut once (~3 minutes)
        </summary>
        <div className="mt-2.5 space-y-1.5">
          <p className={step}>
            <span className={num}>1.</span>
            <span>
              In Apple <b>Reminders</b>, create a list named <span className={kbd}>Personal Agent</span> (platform
              tasks will land there).
            </span>
          </p>
          <p className={step}>
            <span className={num}>2.</span>
            <span>
              Open <b>Shortcuts</b> → <b>+</b> → name it <span className={kbd}>Agent Sync</span>.
            </span>
          </p>
          <p className={step}>
            <span className={num}>3.</span>
            <span>
              Add <b>Get Contents of URL</b> → paste the <b>Pull URL</b>. Leave Method as GET.
            </span>
          </p>
          <p className={step}>
            <span className={num}>4.</span>
            <span>
              Add <b>Get Dictionary Value</b> → key <span className={kbd}>add</span> from <i>Contents of URL</i>.
            </span>
          </p>
          <p className={step}>
            <span className={num}>5.</span>
            <span>
              Add <b>Repeat with Each</b> (uses the Dictionary Value). Inside the repeat, add <b>Add New Reminder</b>:
              title = <i>Repeat Item ▸ title</i>, list = <span className={kbd}>Personal Agent</span>, alert = custom →{" "}
              <i>Repeat Item ▸ due</i>, notes = <i>Repeat Item ▸ notes</i>.
            </span>
          </p>
          <p className={step}>
            <span className={num}>6.</span>
            <span>
              After the repeat, add <b>Find Reminders</b> where <b>List</b> is your inbox list (usually{" "}
              <span className={kbd}>Reminders</span>) and <b>Is Completed</b> = No.
            </span>
          </p>
          <p className={step}>
            <span className={num}>7.</span>
            <span>
              Add <b>Repeat with Each</b> (uses the found reminders). Inside, add <b>Get Contents of URL</b> → paste
              the <b>Push URL</b> → Method <b>POST</b> → Request Body <b>JSON</b> with fields: <span className={kbd}>title</span> ={" "}
              <i>Repeat Item ▸ Name</i>, <span className={kbd}>key</span> = <i>Repeat Item ▸ Creation Date</i> (tap the
              variable → Format: <b>ISO 8601</b>), <span className={kbd}>due</span> = <i>Repeat Item ▸ Due Date</i>{" "}
              (ISO 8601 too).
            </span>
          </p>
          <p className={step}>
            <span className={num}>8.</span>
            <span>
              <b>Optional (completions):</b> add another <b>Find Reminders</b> — List{" "}
              <span className={kbd}>Personal Agent</span>, Is Completed = Yes — with a repeat that POSTs to the Push
              URL: <span className={kbd}>completed</span> = <span className={kbd}>true</span>,{" "}
              <span className={kbd}>notes</span> = <i>Repeat Item ▸ Notes</i>.
            </span>
          </p>
        </div>
      </details>

      <details className="rounded-[12px] border border-line2 bg-cardalt px-3.5 py-3">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.1em] text-ink3">
          ⚙️ Make it automatic
        </summary>
        <div className="mt-2.5 space-y-1.5">
          <p className={step}>
            <span className={num}>1.</span>
            <span>
              Shortcuts → <b>Automation</b> tab → <b>+</b> → <b>When “Reminders” app is Opened</b> → <b>Run
              Immediately</b> → pick <span className={kbd}>Agent Sync</span>.
            </span>
          </p>
          <p className={step}>
            <span className={num}>2.</span>
            <span>
              Add a second automation on a <b>Time of Day</b> trigger (e.g. 8:00) so it also syncs untouched, and say{" "}
              <i>“Hey Siri, Agent Sync”</i> any time for an instant pass.
            </span>
          </p>
          <p className={step}>
            <span className={num}>3.</span>
            <span>
              Duplicates are impossible by design: platform-born reminders carry a <span className={kbd}>pa:</span>{" "}
              marker in their notes, and phone-born reminders are keyed by their creation date — both sides skip what
              they’ve already seen.
            </span>
          </p>
        </div>
      </details>
    </div>
  );
}
