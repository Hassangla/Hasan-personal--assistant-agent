"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { areaMeta } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import { toast } from "@/components/app/Toast";

type StateChip = { color: string; label: string };
type ChecklistPreview = {
  done: number;
  total: number;
  items: { id: string; title: string; done: boolean; dueIso: string | null }[];
};

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
  dueIso,
  goalTitle,
  checklist,
}: {
  id: string;
  title: string;
  area?: string | null;
  badge?: string | null;
  state?: StateChip | null;
  variant: "todo" | "delegated";
  who?: string | null;
  dueIso?: string | null;
  goalTitle?: string | null;
  checklist?: ChecklistPreview | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [gone, setGone] = useState<false | "done" | "deleted">(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showCl, setShowCl] = useState(false);
  const [clOverrides, setClOverrides] = useState<Record<string, boolean>>({});
  const [delegating, setDelegating] = useState(false);
  const [delegateName, setDelegateName] = useState("");
  const m = area ? areaMeta(area) : null;

  // Optimistic: flip instantly, undo only if the server disagrees.
  async function toggleClItem(itemId: string, currentDone: boolean) {
    setClOverrides((o) => ({ ...o, [itemId]: !currentDone }));
    try {
      const res = await fetch("/api/tasks/checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "toggle", item_id: itemId }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setClOverrides((o) => ({ ...o, [itemId]: currentDone }));
      toast("Couldn't update that item — try again", "err");
    }
  }

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
      toast("Task completed ✓");
      setTimeout(() => router.refresh(), 800);
    } catch {
      setGone(false);
      setBusy(false);
      toast("Couldn't complete that — try again", "err");
    }
  }
  async function del() {
    if (busy) return;
    setBusy(true);
    setGone("deleted");
    try {
      await post("/api/tasks/delete", { task_id: id });
      toast("Task deleted");
      setTimeout(() => router.refresh(), 700);
    } catch {
      setGone(false);
      setBusy(false);
      setConfirmDel(false);
      toast("Couldn't delete that — try again", "err");
    }
  }
  async function submitDelegate(e: React.FormEvent) {
    e.preventDefault();
    const person = delegateName.trim();
    if (!person || busy) return;
    setBusy(true);
    try {
      await post("/api/tasks/delegate", { task_id: id, person });
      toast(`Delegated to ${person} → I'm chasing it for you`);
      setDelegating(false);
      setDelegateName("");
      router.refresh();
    } catch {
      toast("Couldn't delegate that — try again", "err");
    } finally {
      setBusy(false);
    }
  }
  async function takeBack() {
    if (busy) return;
    setBusy(true);
    try {
      await post("/api/tasks/delegate", { task_id: id, takeBack: true });
      toast("Back in your To-Do ↩");
      router.refresh();
    } catch {
      setBusy(false);
      toast("Couldn't take that back — try again", "err");
    }
  }

  const titleStyle = gone
    ? { color: "#71767F", textDecoration: "line-through" as const }
    : { color: "#F3F1EC" };
  const iconBtn =
    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] text-[12px] text-ink3 transition hover:bg-line2";

  return (
    <>
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
          style={{ borderColor: "#3A3F47" }}
          className="h-[21px] w-[21px] shrink-0 cursor-pointer rounded-full border-2 bg-transparent transition hover:border-good"
        />
      )}

      {badge && <span className="w-5 shrink-0 font-mono text-[11px] font-semibold text-inkfaint">{badge}</span>}

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => router.push(`${pathname}?task=${id}`)}
          title="Open task details"
          className="block w-full truncate text-left text-[14.5px] font-medium hover:underline"
          style={titleStyle}
        >
          {title}
        </button>
        {variant === "delegated" && who && (
          <span className="block truncate text-[11px] text-ink3">
            with {who}
            {m ? ` · ${m.label}` : ""}
          </span>
        )}
        {variant === "todo" && (goalTitle || (checklist && checklist.total > 0)) && (
          <span className="flex items-center gap-2 text-[11px] text-ink3">
            {checklist && checklist.total > 0 && (
              <button
                type="button"
                onClick={() => setShowCl((v) => !v)}
                title={showCl ? "Hide checklist" : "Show checklist"}
                className={`shrink-0 rounded-[5px] px-1 font-mono text-[10.5px] font-semibold transition hover:bg-line2 ${
                  checklist.done === checklist.total ? "text-good" : "text-ink3"
                }`}
              >
                ☑ {checklist.done}/{checklist.total} {showCl ? "▾" : "▸"}
              </button>
            )}
            {goalTitle && (
              <span className="min-w-0 truncate" title="Contributes to this goal">
                🎯 {goalTitle}
              </span>
            )}
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
      {variant === "todo" &&
        !gone &&
        (dueIso ? (
          <TaskTimer dueIso={dueIso} />
        ) : (
          state && (
            <span
              style={{ color: state.color, background: state.color + "16" }}
              className="shrink-0 whitespace-nowrap rounded-[6px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.03em]"
            >
              {state.label}
            </span>
          )
        ))}

      {/* MOVE + DELETE */}
      {!gone && delegating && (
        <form onSubmit={submitDelegate} className="flex shrink-0 items-center gap-1">
          <input
            value={delegateName}
            onChange={(e) => setDelegateName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setDelegating(false)}
            placeholder="to whom?"
            autoFocus
            className="w-[110px] rounded-[7px] border border-line bg-card px-2 py-1 text-[12px] text-ink outline-none"
          />
          <button
            type="submit"
            disabled={busy || !delegateName.trim()}
            className="rounded-[7px] bg-accent px-2 py-1 text-[11px] font-bold text-[#0C0D10] disabled:opacity-50"
          >
            →
          </button>
          <button type="button" onClick={() => setDelegating(false)} className={iconBtn} title="Cancel">
            ✕
          </button>
        </form>
      )}
      {!gone && !delegating && (
        <div className="flex shrink-0 items-center gap-0.5">
          {variant === "todo" ? (
            <button onClick={() => setDelegating(true)} disabled={busy} title="Delegate → I'm Chasing" className={iconBtn}>
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
    {showCl && checklist && checklist.total > 0 && !gone && (
      <div className="mb-1 ml-[30px] border-l-2 border-line2 pl-3">
        {checklist.items.map((c) => {
          const eff = clOverrides[c.id] ?? c.done;
          return (
          <div key={c.id} className="flex items-center gap-2 py-[3px] text-[12.5px]">
            <button
              type="button"
              onClick={() => toggleClItem(c.id, eff)}
              title={eff ? "Mark not done" : "Mark done"}
              className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2 text-[9px] font-bold transition ${
                eff ? "border-good bg-good text-white" : "border-[#3A3F47] bg-transparent hover:border-good"
              }`}
            >
              {eff ? "✓" : ""}
            </button>
            <span
              className="min-w-0 flex-1 truncate"
              style={eff ? { color: "#71767F", textDecoration: "line-through" } : { color: "#C7CBD1" }}
            >
              {c.title}
            </span>
            {!eff && c.dueIso && <TaskTimer dueIso={c.dueIso} />}
          </div>
          );
        })}
        {checklist.total > checklist.items.length && (
          <button
            type="button"
            onClick={() => router.push(`${pathname}?task=${id}`)}
            className="py-[3px] font-mono text-[10.5px] text-accent hover:underline"
          >
            all {checklist.total} items →
          </button>
        )}
      </div>
    )}
    </>
  );
}
