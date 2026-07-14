"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AREA_META } from "@/lib/areas";
import { toast } from "@/components/app/Toast";

// Contact import: pick a .vcf → photos are stripped locally (never uploaded)
// → server parses + matches → review screen (untick noise, adjust areas) →
// commit. Nothing is written until Import is pressed.

type Item = {
  idx: number;
  name: string;
  org: string | null;
  title: string | null;
  emails: string[];
  phones: string[];
  bday: string | null;
  note: string | null;
  decision: "new" | "merge";
  matchId: string | null;
  matchName: string | null;
  suggestedArea: string | null;
  include: boolean;
};

// Drop PHOTO properties (with their folded continuation lines) client-side.
function stripPhotos(vcf: string): string {
  const lines = vcf.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^(item\d+\.)?photo[;:]/i.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && (line.startsWith(" ") || line.startsWith("\t"))) continue;
    skipping = false;
    out.push(line);
  }
  return out.join("\n");
}

export function PeopleImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [areas, setAreas] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  async function onFile(f: File) {
    setBusy(true);
    try {
      const raw = await f.text();
      const slim = stripPhotos(raw);
      const res = await fetch("/api/people/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "preview", vcf: slim }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.error ?? "Couldn't read that file", "err");
        return;
      }
      const its: Item[] = j.items ?? [];
      setItems(its);
      const a: Record<number, string> = {};
      for (const it of its) if (it.suggestedArea) a[it.idx] = it.suggestedArea;
      setAreas(a);
    } catch {
      toast("Couldn't read that file", "err");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggle(idx: number) {
    setItems((list) => (list ? list.map((i) => (i.idx === idx ? { ...i, include: !i.include } : i)) : list));
  }
  function setAll(v: boolean) {
    setItems((list) => (list ? list.map((i) => ({ ...i, include: v })) : list));
  }

  async function commit() {
    if (!items || busy) return;
    const chosen = items.filter((i) => i.include);
    if (!chosen.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/people/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "commit",
          items: chosen.map((i) => ({
            name: i.name,
            org: i.org,
            title: i.title,
            emails: i.emails,
            phones: i.phones,
            bday: i.bday,
            note: i.note,
            area: areas[i.idx] || null,
            matchId: i.matchId,
          })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(j.error ?? "Import failed", "err");
        return;
      }
      toast(`Imported ✓ ${j.added} new · ${j.merged} enriched${j.skipped ? ` · ${j.skipped} skipped` : ""}`);
      setItems(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const selected = items?.filter((i) => i.include).length ?? 0;

  return (
    <div className="mb-5 rounded-[14px] border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink3">📇 Import contacts</span>
        <span className="text-[12px] text-ink3">
          iCloud.com → Contacts → select all → ⚙ → Export vCard. Photos never leave your device; numbers &amp; emails
          are stored encrypted.
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="ml-auto rounded-[9px] bg-accent px-3.5 py-2 text-[12.5px] font-bold text-[#0C0D10] shadow-accent transition hover:brightness-105 disabled:opacity-50"
        >
          {busy && !items ? "Reading…" : "Choose .vcf file"}
        </button>
      </div>

      {items && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink2">
            <b className="text-inkstrong">{items.length}</b> found ·{" "}
            <span className="text-good">{items.filter((i) => i.decision === "new").length} new</span> ·{" "}
            <span className="text-blue">{items.filter((i) => i.decision === "merge").length} will enrich existing</span>
            <span className="ml-auto flex gap-2">
              <button onClick={() => setAll(true)} className="font-mono text-[11px] text-accent hover:underline">
                all
              </button>
              <button onClick={() => setAll(false)} className="font-mono text-[11px] text-accent hover:underline">
                none
              </button>
            </span>
          </div>
          <div className="max-h-[380px] overflow-y-auto rounded-[10px] border border-line2">
            {items.map((i) => (
              <div key={i.idx} className={`flex items-center gap-2.5 border-b border-line2 px-3 py-2 ${i.include ? "" : "opacity-45"}`}>
                <input type="checkbox" checked={i.include} onChange={() => toggle(i.idx)} className="h-4 w-4 accent-[#C2F24C]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-inkstrong">{i.name}</span>
                    {i.decision === "merge" && (
                      <span className="shrink-0 rounded-[5px] bg-[#5C8DF016] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-blue">
                        merges → {i.matchName}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11.5px] text-ink3">
                    {[i.title, i.org, i.emails[0], i.phones[0]].filter(Boolean).join(" · ") || "no details"}
                  </div>
                </div>
                <select
                  value={areas[i.idx] ?? ""}
                  onChange={(e) => setAreas((a) => ({ ...a, [i.idx]: e.target.value }))}
                  className="shrink-0 rounded-[7px] border border-line bg-card px-1.5 py-1 text-[11px] text-ink2 outline-none"
                >
                  <option value="">area…</option>
                  {AREA_META.map((a) => (
                    <option key={a.slug} value={a.canonical}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <button
              onClick={commit}
              disabled={busy || selected === 0}
              className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-bold text-[#0C0D10] shadow-accent disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${selected} contact${selected === 1 ? "" : "s"}`}
            </button>
            <button onClick={() => setItems(null)} disabled={busy} className="px-2 text-[13px] text-ink3 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
