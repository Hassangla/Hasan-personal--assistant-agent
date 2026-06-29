"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { areaMeta } from "@/lib/areas";

type StateChip = { color: string; label: string };

// A task row with THREE clearly-distinct actions:
//   ✓ (green circle) = complete   ·   🗑 (with inline confirm) = delete   ·
//   → delegate (To-Do → I'm Chasing)  /  ↩ take back (I'm Chasing → To-Do)
export function TaskItem({
  id,
  title,
  area,
  badge,
  state,
  variant,
  who,
}: {
  id: string;
  title: string;
  area?: string | null;
  badge?: string | null;
  state?: StateChip | null;
  variant: "todo" | "delegated";
  who?: string | null;
}) {
  const router = useRouter();
  const [gone, setGone] = useState<false | "done" | "deleted">(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const m = area ? areaMeta(area) : null;

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error();
  }

  async function complete() {
    if (busy || gone) return;
    setBusy(true);
    setGone("done");
    try {
      await post("/api/tasks/complete", { task_id: id });
      setTimeout(() => router.refresh(), 800);
    } catch {
      setGone(false);
      setBusy(false);
    }
  }
  async function del() {
    if (busy) return;
    setBusy(true);
    setGone("deleted");
    try {
      await post("/api/tasks/delete", { task_id: id });
      setTimeout(() => router.refresh(), 700);
    } catch {
      setGone(false);
      setBusy(false);
      setConfirmDel(false);
    }
  }
  async function delegate() {
    const person = window.prompt("Delegate this task to whom?");
    if (!person || !person.trim() || busy) return;
    setBusy(true);
    try {
      await post("/api/tasks/delegate", { task_id: id, person: person.trim() });
      router.refresh();
    } catch {
      setBusy(false);
    }
  }
  async function takeBack() {
    if (busy) return;
    setBusy(true);
    try {
      await post("/api/tasks/delegate", { task_id: id, takeBack: true });
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  const titleStyle = gone
    ? { color: "#A99F8C", textDecoration: "line-through" as const }
    : { color: "#322E27" };
  const iconBtn =
    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] text-[12px] text-ink3 transition hover:bg-line2";

  return (
    <div className="-mx-2.5 flex items-center gap-2.5 rounded-[10px] border-t border-line2 px-2.5 py-[11px] hover:bg-cardalt">
      {/* COMPLETE */}
      {gone === "done" ? (
        <span className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-2 border-good bg-good text-[12px] font-bold text-white">
          ✓
        </span>
      ) : (
        <button
          type="button"
          onClick={complete}
          title="Mark complete"
          aria-label="Mark complete"
          disabled={!!gone}
          style={{ borderColor: "#CFC6B3" }}
          className="h-[21px] w-[21px] shrink-0 cursor-pointer rounded-full border-2 bg-transparent transition hover:border-good"
        />
      )}

      {badge && <span className="w-5 shrink-0 font-mono text-[11px] font-semibold text-inkfaint">{badge}</span>}

      <div className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium" style={titleStyle}>
          {title}
        </span>
        {variant === "delegated" && who && (
          <span className="block truncate text-[11px] text-ink3">
            with {who}
            {m ? ` · ${m.label}` : ""}
          </span>
        )}
      </div>

      {variant === "todo" && m && (
        <span
          style={{ color: m.color, background: m.color + "14" }}
          className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-[9px] py-1 text-[12px] font-semibold sm:inline-flex"
        >
          <span style={{ background: m.color }} className="h-1.5 w-1.5 rounded-full" />
          {m.label}
        </span>
      )}
      {variant === "todo" && state && !gone && (
        <span
          style={{ color: state.color, background: state.color + "16" }}
          className="shrink-0 whitespace-nowrap rounded-[6px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.03em]"
        >
          {state.label}
        </span>
      )}

      {/* MOVE + DELETE */}
      {!gone && (
        <div className="flex shrink-0 items-center gap-0.5">
          {variant === "todo" ? (
            <button onClick={delegate} disabled={busy} title="Delegate → I'm Chasing" className={iconBtn}>
              →
            </button>
          ) : (
            <button onClick={takeBack} disabled={busy} title="Take back → To-Do" className={iconBtn}>
              ↩
            </button>
          )}
          {confirmDel ? (
            <span className="flex items-center gap-1">
              <button
                onClick={del}
                disabled={busy}
                className="rounded-[7px] bg-danger px-2 py-1 text-[10px] font-bold uppercase text-white"
              >
                Delete
              </button>
              <button onClick={() => setConfirmDel(false)} className={iconBtn} title="Cancel">
                ✕
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              disabled={busy}
              title="Delete task"
              aria-label="Delete task"
              className={`${iconBtn} hover:text-danger`}
            >
              🗑
            </button>
          )}
        </div>
      )}
    </div>
  );
}
