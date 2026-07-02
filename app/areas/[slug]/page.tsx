import { notFound } from "next/navigation";
import Link from "next/link";
import { getAreaData } from "@/lib/dashboard/area";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { CompletableTaskRow } from "@/components/app/CompletableTaskRow";
import { Card, SectionHeader, Avatar } from "@/components/app/ui";

export const dynamic = "force-dynamic";

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getAreaData(slug);
  if (!d) notFound();
  const c = d.meta.color;

  return (
    <div className="min-h-screen pb-[72px]">
      <Header pendingCount={d.pendingCount} tz={USER_TIMEZONE} width="narrow" />

      <div className="mx-auto max-w-[980px] px-4 sm:px-8">
        {/* BREADCRUMB */}
        <div className="mt-6 font-mono text-[11px] tracking-[0.06em] text-inkfaint">
          <Link href="/" className="text-inkfaint no-underline hover:text-ink2">
            ← DASHBOARD
          </Link>
          <span className="mx-2">/</span>
          <span style={{ color: c }}>{d.meta.label}</span>
        </div>

        {/* HERO */}
        <div className="mt-4 rounded-[20px] border p-5 sm:p-[30px]" style={{ background: c + "0e", borderColor: c + "33" }}>
          <div className="flex items-center gap-[13px]">
            <span style={{ background: c }} className="h-3.5 w-3.5 shrink-0 rounded-full" />
            <h1 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.025em] sm:text-[38px]" style={{ color: c }}>
              {d.meta.label}
            </h1>
          </div>
          <div className="mt-5 flex flex-wrap gap-7">
            {[
              { n: d.tasks.length, l: "open tasks" },
              { n: d.plans.length, l: "plans" },
              { n: d.people.length, l: "people" },
            ].map((s, i) => (
              <div key={i}>
                <span className="font-display text-[26px] font-extrabold text-inkstrong">{s.n}</span>
                <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink3">{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* TASKS */}
        <Card className="mt-6 px-5 pb-4 pt-6 sm:px-7">
          <SectionHeader index="01" title="Tasks" size={20} meta="click the circle to complete" />
          <div className="mt-1.5">
            {d.tasks.length ? (
              d.tasks.map((t) => (
                <CompletableTaskRow
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  layout="area"
                  state={{ color: t.state.color, label: t.state.label }}
                  dueIso={t.dueIso}
                />
              ))
            ) : (
              <div className="px-1 pb-5 pt-7 text-center text-[14px] text-ink3">
                All clear in this area — nothing open.
              </div>
            )}
          </div>
        </Card>

        {/* PLANS + PEOPLE */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
          <Card className="px-5 pb-4 pt-6 sm:px-[26px]">
            <SectionHeader index="02" title="Plans" size={20} />
            <div className="mt-1">
              {d.plans.length ? (
                d.plans.map((p, i) => (
                  <div key={i} className="flex items-start gap-[11px] border-t border-line2 py-[11px]">
                    <span
                      style={{ color: c, background: c + "16" }}
                      className="mt-px whitespace-nowrap rounded-[5px] px-[7px] py-[3px] font-mono text-[9px] uppercase tracking-[0.06em]"
                    >
                      {p.window}
                    </span>
                    <span className="text-[14px] font-medium leading-snug text-inkstrong">{p.text}</span>
                  </div>
                ))
              ) : (
                <div className="px-1 py-5 text-[13.5px] text-inkfaint">No plans filed here yet.</div>
              )}
            </div>
          </Card>

          <Card className="px-5 pb-4 pt-6 sm:px-[26px]">
            <SectionHeader index="03" title="People" size={20} />
            <div className="mt-1">
              {d.people.length ? (
                d.people.map((p) => (
                  <Link
                    key={p.id}
                    href="/people"
                    className="flex items-center gap-3 border-t border-line2 py-[11px] no-underline"
                  >
                    <Avatar name={p.name} area={d.meta.canonical} />
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold text-inkstrong">{p.name}</div>
                      <div className="text-[12px] text-ink3">{p.role}</div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="px-1 py-5 text-[13.5px] text-inkfaint">No contacts linked to this area yet.</div>
              )}
            </div>
          </Card>
        </div>

        {/* INBOX */}
        {d.emails.length > 0 && (
          <Card className="mt-6 px-5 pb-[18px] pt-6 sm:px-7">
            <SectionHeader index="04" title="Inbox" size={20} />
            <div className="mt-1">
              {d.emails.map((e) => (
                <div key={e.id} className="border-t border-line2 py-[15px]">
                  <div className="mb-[3px] text-[13px] font-bold text-inkstrong">{e.from}</div>
                  <div className="text-[14.5px] font-semibold text-inkstrong">{e.subject}</div>
                  {e.summary && <div className="mt-[3px] text-[13.5px] leading-normal text-ink2">{e.summary}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
