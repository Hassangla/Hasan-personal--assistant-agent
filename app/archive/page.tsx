import { getArchiveData, type ArchiveItem } from "@/lib/dashboard/archive";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { Card, SectionHeader, AreaTag } from "@/components/app/ui";

export const dynamic = "force-dynamic";

function Row({ item }: { item: ArchiveItem }) {
  const done = item.status === "done";
  return (
    <div className="flex items-start gap-3 border-t border-line2 py-3 first:border-t-0">
      <span className={`mt-0.5 font-mono text-[13px] ${done ? "text-good" : "text-ink3"}`}>{done ? "✓" : "⊘"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] text-ink2 line-through decoration-line">
            {item.title}
          </span>
          {item.area && <AreaTag area={item.area} />}
          {item.delegatedTo && (
            <span
              style={{ color: "#5C8DF0", background: "#5C8DF016" }}
              className="rounded-[6px] px-2 py-1 font-mono text-[10px] font-semibold"
            >
              → {item.delegatedTo}
            </span>
          )}
          <span className="shrink-0 font-mono text-[10px] text-inkfaint">{item.whenText}</span>
        </div>
        {item.reason && (
          <div className="mt-0.5 text-[12px] text-ink3">
            <span className="text-inkfaint">reason:</span> {item.reason}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function ArchivePage() {
  const d = await getArchiveData();

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="archive" pendingCount={d.pendingCount} tz={USER_TIMEZONE} width="narrow" />

      <div className="mx-auto max-w-[980px] px-4 sm:px-8">
        <div className="mt-[30px]">
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            Done &amp; dropped — the trail
          </div>
          <h1 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.025em] text-ink sm:text-[38px]">
            Archive
          </h1>
          <p className="m-0 mt-3 max-w-[560px] text-[15px] text-ink2">
            Everything you finished or dropped, with the reason the agent recorded. Reopen anything by mentioning it on
            Telegram.
          </p>
        </div>

        <Card className="mt-6 px-5 pb-4 pt-6 sm:px-7">
          <SectionHeader index="01" title="Completed" size={20} meta={`${d.done.length}`} />
          <div className="mt-1.5">
            {d.done.length ? (
              d.done.map((i) => <Row key={i.id} item={i} />)
            ) : (
              <div className="px-1 pb-5 pt-6 text-center text-[14px] text-ink3">Nothing completed yet.</div>
            )}
          </div>
        </Card>

        <Card className="mt-6 px-5 pb-4 pt-6 sm:px-7">
          <SectionHeader index="02" title="Deleted" size={20} meta={`${d.dropped.length}`} />
          <div className="mt-1.5">
            {d.dropped.length ? (
              d.dropped.map((i) => <Row key={i.id} item={i} />)
            ) : (
              <div className="px-1 pb-5 pt-6 text-center text-[14px] text-ink3">Nothing dropped — clean slate.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
