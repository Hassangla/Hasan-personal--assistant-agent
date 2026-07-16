"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { areaMeta, AREA_META } from "@/lib/areas";
import { TaskTimer } from "@/components/app/TaskTimer";
import { LabelPicker } from "@/components/app/LabelPicker";
import { DeadlineField } from "@/components/app/DeadlineField";
import { toast } from "@/components/app/Toast";

type TaskFile = { id: string; name: string; size: number; mime: string | null; url: string | null };
type ChecklistItem = { id: string; title: string; dueIso: string | null; area: string | null; done: boolean };
type Detail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueIso: string | null;
  createdIso: string | null;
  area: string | null;
  goalId: string | null;
  goal: string | null;
  delegatedTo: string | null;
  nudgeCount: number;
  labels?: string[];
  lastReason: string | null;
  files?: TaskFile[];
  checklist?: ChecklistItem[];
};

function fmtSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// ISO → value for <input type="datetime-local"> in the browser's timezone.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
type Goal = { id: string; title: string; horizon: string };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

// Global slide-over opened via ?task=<id>. Click any task to see its full
// context (area · goal · deadline+timer · delegation) and act on it in place.
export function TaskDetailPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const taskId = params.get("task");

  const [d, setD] = useState<Detail | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [now, setNow] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [clTitle, setClTitle] = useState("");
  const [clDue, setClDue] = useState("");
  const [clArea, setClArea] = useState("");
  const [clBusy, setClBusy] = useState(false);
  const [editingDue, setEditingDue] = useState(false);
  const [dueInput, setDueInput] = useState("");
  const [panelDelegating, setPanelDelegating] = useState(false);
  const [panelDelegateName, setPanelDelegateName] = useState("");

  async function saveDue(value: string) {
    if (!taskId || busy) return;
    setBusy(true);
    try {
      await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, due: value }),
      });
      toast(value ? "Deadline updated ⏰ — reminder follows shortly" : "Deadline cleared");
      setEditingDue(false);
      load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Labels toggle instantly (optimistic), then persist.
  async function toggleLabel(next: string[]) {
    if (!taskId) return;
    setD((cur) => (cur ? { ...cur, labels: next } : cur));
    try {
      await fetch("/api/tasks/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, labels: next }),
      });
      router.refresh();
    } catch {
      toast("Couldn't update labels — try again", "err");
      load();
    }
  }

  async function checklistCall(payload: Record<string, unknown>) {
    if (clBusy) return;
    setClBusy(true);
    // Toggles feel instant: flip locally first, the reload just confirms.
    if (payload.action === "toggle") {
      setD((cur) =>
        cur
          ? {
              ...cur,
              checklist: (cur.checklist ?? []).map((c) =>
                c.id === payload.item_id ? { ...c, done: !c.done } : c,
              ),
            }
          : cur,
      );
    }
    try {
      await fetch("/api/tasks/checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      load();
    } finally {
      setClBusy(false);
    }
  }

  async function addChecklistItem(e: React.FormEvent) {
    e.preventDefault();
    if (!clTitle.trim() || !taskId) return;
    await checklistCall({ action: "add", task_id: taskId, title: clTitle.trim(), due: clDue || "", area: clArea || "" });
    setClTitle("");
    setClDue("");
    setClArea("");
  }

  async function uploadFile(f: File) {
    if (!taskId || uploading) return;
    if (f.size > 4 * 1024 * 1024) {
      setFileMsg("Too large — 4 MB max.");
      return;
    }
    setUploading(true);
    setFileMsg(null);
    try {
      const fd = new FormData();
      fd.set("task_id", taskId);
      fd.set("file", f);
      const res = await fetch("/api/tasks/files", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setFileMsg(j.error ?? "Upload failed.");
      else toast("File attached 📎");
      load();
    } catch {
      setFileMsg("Network error.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteFile(fileId: string) {
    if (uploading) return;
    setUploading(true);
    try {
      await fetch("/api/tasks/files/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      load();
    } finally {
      setUploading(false);
    }
  }

  function load() {
    if (!taskId) return;
    fetch(`/api/task?id=${encodeURIComponent(taskId)}`)
      .then((r) => r.json())
      .then((j) => {
        setD(j.task ?? null);
        setGoals(j.goals ?? []);
      })
      .catch(() => setD(null));
  }

  useEffect(() => {
    if (!taskId) {
      setD(null);
      return;
    }
    setLoading(true);
    setConfirmDel(false);
    fetch(`/api/task?id=${encodeURIComponent(taskId)}`)
      .then((r) => r.json())
      .then((j) => {
        setD(j.task ?? null);
        setGoals(j.goals ?? []);
      })
      .catch(() => setD(null))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Friendly slide-over behavior: Esc closes, the page behind stops scrolling.
  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(pathname);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [taskId, pathname, router]);

  if (!taskId) return null;

  const close = () => router.push(pathname);
  async function post(url: string, body: unknown) {
    setBusy(true);
    try {
      await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    await post("/api/tasks/complete", { task_id: taskId });
    toast("Task completed ✓");
    router.push(pathname);
    router.refresh();
  }
  async function del() {
    await post("/api/tasks/delete", { task_id: taskId });
    toast("Task deleted");
    router.push(pathname);
    router.refresh();
  }
  async function submitPanelDelegate(e: React.FormEvent) {
    e.preventDefault();
    const p = panelDelegateName.trim();
    if (!p) return;
    await post("/api/tasks/delegate", { task_id: taskId, person: p });
    toast(`Delegated to ${p} → I'm chasing it for you`);
    setPanelDelegating(false);
    setPanelDelegateName("");
    load();
    router.refresh();
  }
  async function takeBack() {
    await post("/api/tasks/delegate", { task_id: taskId, takeBack: true });
    toast("Back in your To-Do ↩");
    load();
    router.refresh();
  }
  async function setGoal(gid: string) {
    await post("/api/tasks/link-goal", { task_id: taskId, goal_id: gid });
    toast(gid ? "Linked to goal 🎯" : "Unlinked from goal");
    load();
    router.refresh();
  }

  const m = d?.area ? areaMeta(d.area) : null;
  let pct = 0;
  let overdue = false;
  if (d?.dueIso) {
    const due = new Date(d.dueIso).getTime();
    overdue = due < now;
    if (d.createdIso) {
      const created = new Date(d.createdIso).getTime();
      if (due > created) pct = Math.min(100, Math.max(0, ((now - created) / (due - created)) * 100));
    }
  }

  const label = "mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink3";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25" onClick={close} />
      <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-line bg-page shadow-[0_0_60px_-15px_rgba(60,45,30,0.55)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-page/90 px-5 py-4 backdrop-blur">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">Task</span>
          <button onClick={close} className="text-[18px] leading-none text-ink3 transition hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {loading || !d ? (
          <div className="p-6 text-[14px] text-ink3">{loading ? "Loading…" : "Task not found."}</div>
        ) : (
          <div className="flex-1 px-5 py-5">
            <h2 className="m-0 text-[19px] font-bold leading-snug text-inkstrong">{d.title}</h2>
            {d.description && <p className="mt-1.5 text-[13px] leading-normal text-ink2">{d.description}</p>}

            <div className="mt-4 space-y-3.5">
              <div>
                <div className={label}>
                  Deadline
                  {!editingDue && (
                    <button
                      onClick={() => {
                        setDueInput(isoToLocalInput(d.dueIso));
                        setEditingDue(true);
                      }}
                      className="ml-2 normal-case tracking-normal text-accent hover:underline"
                    >
                      {d.dueIso ? "edit" : "set"}
                    </button>
                  )}
                </div>
                {editingDue ? (
                  <div className="flex flex-col gap-2">
                    <DeadlineField value={dueInput} onChange={setDueInput} compact />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => saveDue(dueInput)}
                        disabled={busy || !dueInput}
                        className="rounded-[8px] bg-accent px-2.5 py-1.5 text-[12px] font-bold text-[#0C0D10] disabled:opacity-50"
                      >
                        Save
                      </button>
                      {d.dueIso && (
                        <button
                          onClick={() => saveDue("")}
                          disabled={busy}
                          className="rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12px] font-semibold text-[#FF6A45] disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}
                      <button onClick={() => setEditingDue(false)} className="px-1 text-[13px] text-ink3">
                        ✕
                      </button>
                    </div>
                    <span className="font-mono text-[10px] text-inkfaint">
                      Synced reminders get the new alert within two sync cycles.
                    </span>
                  </div>
                ) : d.dueIso ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] text-inkstrong">{fmtDate(d.dueIso)}</span>
                      <TaskTimer dueIso={d.dueIso} />
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line2">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{ width: `${pct}%`, background: overdue ? "#FF6A45" : "#43D3A2" }}
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-inkfaint">created {fmtDate(d.createdIso)}</div>
                  </>
                ) : (
                  <span className="text-[13px] text-ink3">No deadline set.</span>
                )}
              </div>

              <div>
                <div className={label}>Labels</div>
                <LabelPicker value={d.labels ?? []} onChange={toggleLabel} />
              </div>

              <div>
                <div className={label}>Area</div>
                {m ? (
                  <span
                    style={{ color: m.color, background: m.color + "14" }}
                    className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[12px] font-semibold"
                  >
                    <span style={{ background: m.color }} className="h-1.5 w-1.5 rounded-full" />
                    {m.label}
                  </span>
                ) : (
                  <span className="text-[13px] text-ink3">—</span>
                )}
              </div>

              <div>
                <div className={label}>Goal</div>
                <select
                  value={d.goalId ?? ""}
                  onChange={(e) => setGoal(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none"
                >
                  <option value="">— not linked —</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title} ({g.horizon})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-8">
                <div>
                  <div className={label}>Status</div>
                  <span className="text-[13px] capitalize text-inkstrong">
                    {d.delegatedTo ? `Delegated to ${d.delegatedTo}` : d.status}
                  </span>
                </div>
                {d.nudgeCount > 0 && (
                  <div>
                    <div className={label}>Nudges</div>
                    <span className="text-[13px] text-inkstrong">{d.nudgeCount}</span>
                  </div>
                )}
              </div>

              {d.lastReason && (
                <div>
                  <div className={label}>Last note</div>
                  <span className="text-[13px] text-ink2">{d.lastReason}</span>
                </div>
              )}

              <div>
                <div className={label}>
                  Checklist
                  {(d.checklist ?? []).length > 0 && (
                    <span className="ml-2 normal-case tracking-normal text-inkfaint">
                      {(d.checklist ?? []).filter((c) => c.done).length}/{(d.checklist ?? []).length} done
                    </span>
                  )}
                </div>
                {(d.checklist ?? []).length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {(d.checklist ?? []).map((c) => {
                      const cm = c.area ? areaMeta(c.area) : null;
                      return (
                        <li key={c.id} className="flex items-center gap-2 text-[13px]">
                          <button
                            onClick={() => checklistCall({ action: "toggle", item_id: c.id })}
                            disabled={clBusy}
                            title={c.done ? "Mark not done" : "Mark done"}
                            className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition ${
                              c.done ? "border-good bg-good text-white" : "border-[#3A3F47] bg-transparent hover:border-good"
                            }`}
                          >
                            {c.done ? "✓" : ""}
                          </button>
                          <span
                            className="min-w-0 flex-1 truncate"
                            style={c.done ? { color: "#71767F", textDecoration: "line-through" } : { color: "#F3F1EC" }}
                          >
                            {c.title}
                          </span>
                          {cm && (
                            <span
                              style={{ color: cm.color, background: cm.color + "14" }}
                              className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold"
                            >
                              {cm.label}
                            </span>
                          )}
                          {!c.done && c.dueIso && <TaskTimer dueIso={c.dueIso} />}
                          <button
                            onClick={() => checklistCall({ action: "delete", item_id: c.id })}
                            disabled={clBusy}
                            title="Remove item"
                            className="shrink-0 text-[12px] text-ink3 transition hover:text-danger disabled:opacity-50"
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <form onSubmit={addChecklistItem} className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={clTitle}
                    onChange={(e) => setClTitle(e.target.value)}
                    placeholder="Checklist item…"
                    className="min-w-0 flex-1 basis-full rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink outline-none sm:basis-auto"
                  />
                  <input
                    type="datetime-local"
                    value={clDue}
                    onChange={(e) => setClDue(e.target.value)}
                    title="Deadline (optional)"
                    className="rounded-[8px] border border-line bg-card px-2 py-1.5 text-[11.5px] text-ink2 outline-none"
                  />
                  <select
                    value={clArea}
                    onChange={(e) => setClArea(e.target.value)}
                    title="Label (optional)"
                    className="rounded-[8px] border border-line bg-card px-2 py-1.5 text-[11.5px] text-ink2 outline-none"
                  >
                    <option value="">no label</option>
                    {AREA_META.map((a) => (
                      <option key={a.slug} value={a.canonical}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={clBusy || !clTitle.trim()}
                    className="rounded-[8px] bg-accent px-2.5 py-1.5 text-[12px] font-bold text-[#0C0D10] disabled:opacity-50"
                  >
                    {clBusy ? "…" : "Add"}
                  </button>
                </form>
              </div>

              <div>
                <div className={label}>Files</div>
                {(d.files ?? []).length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {(d.files ?? []).map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-[13px]">
                        <span className="shrink-0">📎</span>
                        {f.url ? (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate text-accent underline"
                          >
                            {f.name}
                          </a>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-ink2">{f.name}</span>
                        )}
                        <span className="shrink-0 font-mono text-[10px] text-inkfaint">{fmtSize(f.size)}</span>
                        <button
                          onClick={() => deleteFile(f.id)}
                          disabled={uploading}
                          title="Remove file"
                          className="shrink-0 text-[12px] text-ink3 transition hover:text-danger disabled:opacity-50"
                        >
                          🗑
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f);
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12px] font-semibold text-ink2 transition hover:border-[#3A3F47] hover:text-[#E4E2DC] disabled:opacity-50"
                >
                  {uploading ? "Working…" : "＋ Attach file"}
                </button>
                <span className="ml-2 font-mono text-[10px] text-inkfaint">4 MB max · stays on the platform</span>
                {fileMsg && <p className="m-0 mt-1 text-[12px] text-danger">{fileMsg}</p>}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <button
                onClick={complete}
                disabled={busy}
                className="rounded-[9px] bg-good px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(46,140,97,0.5)] disabled:opacity-50"
              >
                ✓ Complete
              </button>
              {d.delegatedTo ? (
                <button
                  onClick={takeBack}
                  disabled={busy}
                  className="rounded-[9px] border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-ink2 disabled:opacity-50"
                >
                  ↩ Take back
                </button>
              ) : panelDelegating ? (
                <form onSubmit={submitPanelDelegate} className="flex items-center gap-1.5">
                  <input
                    value={panelDelegateName}
                    onChange={(e) => setPanelDelegateName(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setPanelDelegating(false)}
                    placeholder="to whom?"
                    autoFocus
                    className="w-[120px] rounded-[8px] border border-line bg-card px-2.5 py-2 text-[13px] text-ink outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || !panelDelegateName.trim()}
                    className="rounded-[9px] bg-accent px-3 py-2 text-[13px] font-bold text-[#0C0D10] disabled:opacity-50"
                  >
                    →
                  </button>
                  <button type="button" onClick={() => setPanelDelegating(false)} className="px-1 text-[14px] text-ink3">
                    ✕
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setPanelDelegating(true)}
                  disabled={busy}
                  className="rounded-[9px] border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-ink2 disabled:opacity-50"
                >
                  → Delegate
                </button>
              )}
              {confirmDel ? (
                <button
                  onClick={del}
                  disabled={busy}
                  className="ml-auto rounded-[9px] bg-danger px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  Confirm delete
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDel(true)}
                  disabled={busy}
                  className="ml-auto rounded-[9px] px-3.5 py-2 text-[13px] font-semibold text-[#FF6A45] transition hover:text-danger"
                >
                  🗑 Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
