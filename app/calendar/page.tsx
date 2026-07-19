import Link from "next/link";
import { Settings2 } from "lucide-react";
import { getCalendarEvents } from "@/lib/dashboard/calendar";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { CalendarView } from "@/components/app/CalendarView";
import { Card } from "@/components/app/ui";

export const dynamic = "force-dynamic";

// Pure events view — your meetings and deadline-bearing tasks in Month / Week /
// Day / Agenda. All the connect/sync/notification settings moved to /settings.
export default async function CalendarPage() {
  const { events, pendingCount } = await getCalendarEvents();

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="calendar" pendingCount={pendingCount} tz={USER_TIMEZONE} />

      <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
        <div className="mt-[30px] flex items-end justify-between gap-3">
          <div>
            <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              Meetings · deadlines
            </div>
            <h1 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.025em] text-ink sm:text-[38px]">
              Calendar
            </h1>
          </div>
          <Link
            href="/settings"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-line bg-card px-3 py-2 text-[12.5px] font-semibold text-ink2 no-underline transition hover:border-[#3A3F47] hover:text-ink"
          >
            <Settings2 className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">Calendar settings</span>
            <span className="sm:hidden">Settings</span>
          </Link>
        </div>

        <Card className="mt-6 p-3 sm:p-4">
          <CalendarView events={events} tz={USER_TIMEZONE} />
        </Card>
      </div>
    </div>
  );
}
