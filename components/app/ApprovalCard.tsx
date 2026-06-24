"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AreaTag } from "@/components/app/ui";
import type { Approval } from "@/lib/dashboard/approvals";

// One pending action card. Approve runs the real (gated) action server-side;
// Deny rejects it. Both optimistically remove the card, then refresh so it
// drops into "Resolved today". "Edit first" is a placeholder (no-op) for now.
export function ApprovalCard({ a }: { a: Approval }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "approve" | "deny">("");
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState(false);

  async function resolve(action: "approve" | "deny") {
    if (busy || gone) return;
    setBusy(action);
    setErr(false);
    try {
      const res = await fetch("/api/approvals/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: a.id, action }),
      });
      if (!res.ok) throw new Error();
      setGone(true);
      setTimeout(() => router.refresh(), 700);
    } catch {
      setErr(true);
      setBusy("");
    }
  }

  if (gone) return null;

  return (
    <div
      className="rounded-[16px] border border-line bg-card p-6 shadow-soft"
      style={{ borderLeft: `4px solid ${a.typeColor}` }}
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <span
          style={{ color: a.typeColor, background: a.typeColor + "16" }}
          className="rounded-[6px] px-[9px] py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]"
        >
          {a.type}
        </span>
        {a.area && <AreaTag area={a.area} />}
        <span className="ml-auto font-mono text-[10px] text-inkfaint">{a.requested}</span>
      </div>

      <div className="text-[17px] font-bold tracking-[-0.01em] text-inkstrong">{a.title}</div>
      <div className="mt-1 text-[14px] leading-normal text-ink2">{a.why}</div>

      {a.preview && (
        <div className="mt-3.5 rounded-[12px] border border-[#F0EADD] bg-cardalt px-4 py-3.5">
          <div className="mb-[7px] font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#B0A795]">
            {a.previewLabel}
          </div>
          <p className="m-0 whitespace-pre-wrap text-[14px] italic leading-normal text-[#4F483D]">{a.preview}</p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2.5">
        <button
          onClick={() => resolve("approve")}
          disabled={!!busy}
          className="rounded-[10px] bg-good px-5 py-[9px] text-[13px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(46,140,97,0.55)] transition hover:brightness-105 disabled:opacity-50"
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          disabled={!!busy}
          className="rounded-[10px] border border-[#E2DAC9] bg-card px-[18px] py-[9px] text-[13px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:text-[#3F3A32] disabled:opacity-50"
        >
          Edit first
        </button>
        <button
          onClick={() => resolve("deny")}
          disabled={!!busy}
          className="ml-auto rounded-[10px] bg-transparent px-3.5 py-[9px] text-[13px] font-semibold text-[#B26B5A] transition hover:text-danger disabled:opacity-50"
        >
          {busy === "deny" ? "Denying…" : "Deny"}
        </button>
      </div>
      {err && <div className="mt-2 text-[12px] text-danger">Couldn't resolve that — try again.</div>}
    </div>
  );
}
