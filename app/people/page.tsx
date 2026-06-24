import { getPeopleData } from "@/lib/dashboard/people";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { PeopleBrowser } from "@/components/app/PeopleBrowser";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { contacts, pendingCount } = await getPeopleData();

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="people" pendingCount={pendingCount} tz={USER_TIMEZONE} />
      <div className="mx-auto max-w-[1180px] px-8">
        <PeopleBrowser contacts={contacts} />
      </div>
    </div>
  );
}
