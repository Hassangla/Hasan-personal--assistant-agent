import { getApprovalsData } from "@/lib/dashboard/approvals";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { ApprovalCard } from "@/components/app/ApprovalCard";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const d = await getApprovalsData();

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="approvals" pendingCount={d.pendingCount} tz={USER_TIMEZONE} width="narrow" />

      <div className="mx-auto max-w-[980px] px-4 sm:px-8">
        {/* TITLE */}
        <div className="mt-[30px]">
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            Nothing happens without your OK
          </div>
          <h1 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.025em] text-ink sm:text-[38px]">
            Approvals
          </h1>
        </div>

        {/* TRUST BANNER */}
        <div className="mt-5 flex items-start gap-3 rounded-[14px] border border-[#CFE6D6] bg-[#E9F3EC] px-[18px] py-[15px]">
          <span className="mt-[5px] h-[9px] w-[9px] shrink-0 rounded-full bg-good" />
          <p className="m-0 text-[14px] leading-[1.55] text-[#2C5C42]">
            I draft, summarize and queue — but I never send, archive or take an irreversible step until you approve it
            here. Incoming email is treated as untrusted: I read it, never let it act on its own.
          </p>
        </div>

        {/* PENDING */}
        <div className="mb-3.5 mt-[30px] flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[12px] tracking-[0.1em] text-inkfaint">01</span>
          <h2 className="m-0 font-display text-[21px] font-bold tracking-[-0.01em] text-ink">Waiting on you</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{d.pendingCount} pending</span>
        </div>

        {d.pending.length ? (
          <div className="flex flex-col gap-3.5">
            {d.pending.map((a) => (
              <ApprovalCard key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-[#DED5C4] bg-card p-11 text-center">
            <div className="font-display text-[22px] font-extrabold text-inkstrong">All clear.</div>
            <div className="mt-1.5 text-[14px] text-ink3">Nothing needs your sign-off right now — go enjoy the day.</div>
          </div>
        )}

        {/* RESOLVED LOG */}
        {d.log.length > 0 && (
          <>
            <div className="mb-3.5 mt-9 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[12px] tracking-[0.1em] text-inkfaint">02</span>
              <h2 className="m-0 font-display text-[21px] font-bold tracking-[-0.01em] text-ink">Resolved today</h2>
            </div>
            <div className="rounded-[16px] border border-line bg-card px-5 py-2 sm:px-[22px]">
              {d.log.map((l) => (
                <div key={l.id} className="flex items-center gap-3.5 border-t border-line2 py-[13px] first:border-t-0">
                  <span style={{ background: l.color }} className="h-2 w-2 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[#4F483D]">{l.title}</span>
                  <span
                    style={{ color: l.color }}
                    className="font-mono text-[10px] font-semibold uppercase tracking-[0.04em]"
                  >
                    {l.status}
                  </span>
                  <span className="w-16 text-right font-mono text-[10px] text-inkfaint">{l.when}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
