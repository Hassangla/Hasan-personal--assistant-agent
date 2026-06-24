"use client";

import { useMemo, useState } from "react";
import { AREA_META, areaMeta } from "@/lib/areas";
import { initialsOf } from "@/components/app/ui";
import type { PeopleContact } from "@/lib/dashboard/people";

// The interactive two-pane CRM: searchable, area-filterable contact list on the
// left; the selected contact's profile (summary, stats, history, open items) on
// the right. All view state (selection, search, filter) lives here.
export function PeopleBrowser({ contacts }: { contacts: PeopleContact[] }) {
  const [selId, setSelId] = useState<string | null>(contacts[0]?.id ?? null);
  const [area, setArea] = useState<string>("All");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return contacts.filter((c) => {
      const okArea = area === "All" || areaMeta(c.area).canonical === area;
      const okQ = !needle || c.name.toLowerCase().includes(needle) || (c.org ?? "").toLowerCase().includes(needle);
      return okArea && okQ;
    });
  }, [contacts, area, q]);

  const selected = visible.find((c) => c.id === selId) ?? visible[0] ?? null;

  const chips = [{ canonical: "All", label: "All", color: "#7A7264" }, ...AREA_META];

  return (
    <>
      {/* TITLE + SEARCH */}
      <div className="mt-[30px] flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            CRM · built quietly from your inbox
          </div>
          <h1 className="m-0 font-display text-[38px] font-extrabold leading-none tracking-[-0.025em] text-ink">People</h1>
          <p className="m-0 mt-3 max-w-[560px] text-[15px] text-ink2">
            Profiles I assemble from your emails, calls and chats — role, organization, history, and the open items tying
            you together. Nothing here was entered by hand.
          </p>
        </div>
        <div className="flex min-w-[240px] items-center gap-2 rounded-[12px] border border-[#E7E0D2] bg-card px-3.5 py-2.5">
          <span className="font-mono text-[14px] text-inkfaint">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            className="flex-1 border-none bg-transparent text-[14px] text-ink outline-none"
          />
        </div>
      </div>

      {/* AREA CHIPS */}
      <div className="mt-[22px] flex flex-wrap gap-2">
        {chips.map((ch) => {
          const on = area === ch.canonical;
          return (
            <button
              key={ch.canonical}
              onClick={() => setArea(ch.canonical)}
              className="inline-flex items-center gap-[7px] rounded-[20px] border px-[13px] py-1.5 text-[12.5px] font-semibold transition hover:-translate-y-px"
              style={{
                color: ch.color,
                background: on ? ch.color + "18" : "#FFFFFF",
                borderColor: on ? ch.color + "66" : "#EAE3D5",
              }}
            >
              <span style={{ background: ch.color }} className="h-[7px] w-[7px] rounded-full" />
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* TWO PANE */}
      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[350px_1fr]">
        {/* LIST */}
        <div className="flex flex-col gap-2">
          {visible.length ? (
            visible.map((c) => {
              const m = areaMeta(c.area);
              const on = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelId(c.id)}
                  className="flex items-center gap-3 rounded-[14px] border p-[13px] text-left transition hover:-translate-y-[2px]"
                  style={{
                    background: on ? m.color + "12" : "#FFFFFF",
                    borderColor: on ? m.color + "55" : "#EDE6D9",
                  }}
                >
                  <span
                    style={{ background: m.color + "1f", color: m.color }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] font-display text-[14px] font-bold"
                  >
                    {initialsOf(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold text-inkstrong">{c.name}</div>
                    <div className="truncate text-[12px] text-ink3">{c.role}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.area && (
                      <span style={{ color: m.color }} className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                        <span style={{ background: m.color }} className="h-1.5 w-1.5 rounded-full" />
                        {m.label}
                      </span>
                    )}
                    <div className="mt-[3px] font-mono text-[10px] text-inkfaint">{c.last}</div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-[14px] border border-dashed border-line bg-card px-4 py-8 text-center text-[13.5px] text-ink3">
              No one matches.
            </div>
          )}
        </div>

        {/* DETAIL */}
        {selected ? (
          <div className="rounded-[20px] border border-line bg-card p-8 shadow-card">
            <div className="flex items-start gap-[18px]">
              <span
                style={{ background: areaMeta(selected.area).color + "1f", color: areaMeta(selected.area).color }}
                className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[16px] font-display text-[21px] font-extrabold"
              >
                {initialsOf(selected.name)}
              </span>
              <div className="flex-1">
                <h2 className="m-0 font-display text-[25px] font-extrabold tracking-[-0.02em] text-ink">
                  {selected.name}
                </h2>
                <div className="mt-[3px] text-[14px] text-ink2">
                  {selected.role}
                  {selected.org ? ` · ${selected.org}` : ""}
                </div>
                {selected.area && (
                  <span
                    style={{ color: areaMeta(selected.area).color, background: areaMeta(selected.area).color + "14" }}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-semibold"
                  >
                    <span style={{ background: areaMeta(selected.area).color }} className="h-1.5 w-1.5 rounded-full" />
                    {areaMeta(selected.area).label}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button className="rounded-[10px] bg-accent px-4 py-[9px] text-[13px] font-bold text-white shadow-accent transition hover:brightness-105">
                  Draft a message
                </button>
                <button className="rounded-[10px] border border-[#E2DAC9] bg-card px-4 py-[9px] text-[13px] font-semibold text-ink2 transition hover:border-[#CFC6B3] hover:text-[#3F3A32]">
                  Add a task
                </button>
              </div>
            </div>

            {/* what I know */}
            <div className="mt-6 rounded-[14px] border border-[#F0EADD] bg-cardalt px-[18px] py-4">
              <div className="mb-[7px] font-mono text-[10px] uppercase tracking-[0.1em] text-[#B0A795]">What I know</div>
              <p className="m-0 text-[14.5px] leading-relaxed text-[#4F483D]">{selected.summary}</p>
            </div>

            {/* stats */}
            <div className="mt-[18px] grid grid-cols-3 gap-3.5">
              {[
                { n: selected.stats.emails, l: "emails" },
                { n: selected.stats.tasks, l: "linked tasks" },
                { n: selected.stats.since, l: "first seen" },
              ].map((s, i) => (
                <div key={i} className="rounded-[12px] border border-[#EDE6D9] px-4 py-3.5">
                  <div className="font-display text-[24px] font-extrabold leading-none text-inkstrong">{s.n}</div>
                  <div className="mt-[7px] font-mono text-[10px] uppercase tracking-[0.06em] text-ink3">{s.l}</div>
                </div>
              ))}
            </div>

            {/* history */}
            {selected.timeline.length > 0 && (
              <div className="mt-[26px]">
                <div className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#B0A795]">History</div>
                {selected.timeline.map((h, i) => {
                  const m = areaMeta(selected.area);
                  return (
                    <div key={i} className="flex items-start gap-3.5 py-[9px]">
                      <span className="w-[74px] shrink-0 pt-0.5 text-right font-mono text-[11px] text-inkfaint">
                        {h.when}
                      </span>
                      <span
                        className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full"
                        style={{ background: m.color, boxShadow: `0 0 0 4px ${m.color}1f` }}
                      />
                      <span className="flex-1 text-[14px] leading-snug text-[#4F483D]">{h.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* related */}
            {selected.related.length > 0 && (
              <div className="mt-[22px]">
                <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[#B0A795]">
                  Open items together
                </div>
                {selected.related.map((r, i) => (
                  <div
                    key={i}
                    className="mb-2 flex items-center gap-3 rounded-[12px] border border-[#F0EADD] bg-cardalt px-3.5 py-[11px]"
                  >
                    <span className="flex-1 text-[14px] font-medium text-inkstrong">{r.title}</span>
                    <span
                      style={{ color: r.color, background: r.color + "16" }}
                      className="rounded-[6px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.03em]"
                    >
                      {r.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-line bg-card px-8 py-16 text-center text-[14px] text-ink3">
            No people yet — they'll appear here as the agent meets them in your inbox and chats.
          </div>
        )}
      </div>
    </>
  );
}
