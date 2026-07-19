import { headers } from "next/headers";
import { getCalendarData } from "@/lib/dashboard/calendar";
import { USER_TIMEZONE } from "@/lib/config";
import { remindersPullPath, remindersPushPath } from "@/lib/reminders";
import { Header } from "@/components/app/Header";
import { CalendarSync } from "@/components/app/CalendarSync";
import { RemindersSync } from "@/components/app/RemindersSync";
import { NotificationsSetup } from "@/components/app/NotificationsSetup";
import { Card, SectionHeader } from "@/components/app/ui";

export const dynamic = "force-dynamic";

// Everything you configure once and forget: calendar connections, Apple
// Reminders two-way sync, and device notifications. The Calendar page stays
// focused on your actual events.
export default async function SettingsPage() {
  const d = await getCalendarData();
  const host = (await headers()).get("host") ?? "";
  const calHttps = `https://${host}${d.calendarFeedPath}`;
  const calWebcal = `webcal://${host}${d.calendarFeedPath}`;
  const remPull = `https://${host}${remindersPullPath()}`;
  const remPush = `https://${host}${remindersPushPath()}`;

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="settings" pendingCount={d.pendingCount} tz={USER_TIMEZONE} width="narrow" />

      <div className="mx-auto max-w-[980px] px-4 sm:px-8">
        <div className="mt-[30px]">
          <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            Connections · sync · notifications
          </div>
          <h1 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.025em] text-ink sm:text-[38px]">
            Settings
          </h1>
        </div>

        {/* CALENDAR CONNECTIONS */}
        <Card className="mt-6 px-5 pb-5 pt-6 sm:px-7">
          <SectionHeader index="01" title="Calendars" size={20} note="— Google · iCloud · Yahoo · Outlook · Proton · .edu" />
          <CalendarSync httpsUrl={calHttps} webcalUrl={calWebcal} caldavAccounts={d.caldavAccounts} sources={d.sources} />
        </Card>

        {/* APPLE REMINDERS */}
        <Card className="mt-6 px-5 pb-5 pt-6 sm:px-7">
          <SectionHeader index="02" title="Apple Reminders" size={20} note="— two-way task sync" />
          <RemindersSync pullUrl={remPull} pushUrl={remPush} />
        </Card>

        {/* NOTIFICATIONS */}
        <Card className="mt-6 px-5 pb-5 pt-6 sm:px-7">
          <SectionHeader index="03" title="Notifications" size={20} note="— iPhone · iPad · desktop" />
          <NotificationsSetup />
        </Card>
      </div>
    </div>
  );
}
