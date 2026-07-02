import { headers } from "next/headers";
import { getCalendarData, type CalMeeting } from "@/lib/dashboard/calendar";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { CalendarSync } from "@/components/app/CalendarSync";
import { Card, SectionHeader, AreaTag } from "@/components/app/ui";

export const dynamic = "force-dynamic";

function MeetingRow({ m }: { m: CalMeeting }) {
  return (
    <div className="flex items-center gap-3 border-t border-line2 py-2.5 first:border-t-0">
      <span className="text-[15px]">🗓</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-inkstrong">{m.title}</div>
        {m.location && <div className="truncate text-[12px] text-ink3">📍 {m.location}</div>}
      </div>
      {m.area && <AreaTag area={m.area} />}
      <span className="shrink-0 font-mono text-[11px] text-ink3">{m.startText}</span>
    </div>
  );
}

export default async function CalendarPage() {
  const d = await getCalendarData();
  const host = (await headers()).get("host") ?? "";
  const calHttps = `https://${host}${d.calendarFeedPath}`;
  const calWebcal = `webcal://${host}${d.calendarFeedPath}`;

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="calendar" pendingCount={d.pendingCount} tz={USER_TIMEZONE} width="narrow" />

      <div className="mx-auto max-w-[980px] px-4 sm:px-8">
        <div className="mt-[30px]">
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            Meetings · reminders · sync
          </div>
          <h1 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.025em] text-ink sm:text-[38px]">
            Calendar
          </h1>
        </div>

        {/* UPCOMING */}
        <Card className="mt-6 px-5 pb-4 pt-6 sm:px-7">
          <SectionHeader index="01" title="Upcoming" size={20} meta={`${d.upcoming.length} scheduled`} />
          <div className="mt-2">
            {d.upcoming.length ? (
              d.upcoming.map((m) => <MeetingRow key={m.id} m={m} />)
            ) : (
              <p className="py-4 text-center text-[14px] text-ink3">
                No meetings scheduled — tell me on Telegram (&ldquo;meeting with Marina tomorrow 3pm&rdquo;) or connect a
                calendar below.
              </p>
            )}
          </div>
        </Card>

        {/* SYNC */}
        <Card className="mt-6 px-5 pb-5 pt-6 sm:px-7">
          <SectionHeader index="02" title="Sync & connect" size={20} note="— Google · iCloud · Yahoo · Outlook · Proton · .edu" />
          <CalendarSync
            httpsUrl={calHttps}
            webcalUrl={calWebcal}
            caldavAccounts={d.caldavAccounts}
            sources={d.sources}
          />
        </Card>

        {/* PAST */}
        {d.past.length > 0 && (
          <Card className="mt-6 px-5 pb-4 pt-6 sm:px-7">
            <SectionHeader index="03" title="Past" size={20} meta={`${d.past.length}`} />
            <div className="mt-2 opacity-80">
              {d.past.map((m) => (
                <MeetingRow key={m.id} m={m} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
