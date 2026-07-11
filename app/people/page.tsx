import { getPeopleData } from "@/lib/dashboard/people";
import { USER_ID, USER_TIMEZONE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Header } from "@/components/app/Header";
import { PeopleBrowser } from "@/components/app/PeopleBrowser";
import { PeopleImport } from "@/components/app/PeopleImport";
import { PeopleSync } from "@/components/app/PeopleSync";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const sb = supabaseAdmin();
  const [{ contacts, pendingCount }, acctRes, pendingRes, calRes] = await Promise.all([
    getPeopleData(),
    sb
      .from("carddav_accounts")
      .select("username,last_status")
      .eq("user_id", USER_ID)
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    sb
      .from("carddav_contacts")
      .select("id,name,payload", { count: "exact" })
      .eq("user_id", USER_ID)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100),
    sb
      .from("caldav_accounts")
      .select("id")
      .eq("user_id", USER_ID)
      .eq("active", true)
      .ilike("server", "%icloud%")
      .limit(1)
      .maybeSingle(),
  ]);

  const pending = ((pendingRes.data ?? []) as any[]).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "Unknown",
    org: (r.payload?.org as string) ?? null,
    title: (r.payload?.title as string) ?? null,
    email: (r.payload?.emails?.[0] as string) ?? null,
  }));

  return (
    <div className="min-h-screen pb-[72px]">
      <Header active="people" pendingCount={pendingCount} tz={USER_TIMEZONE} />
      <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
        <div className="mt-6">
          <PeopleSync
            connected={
              acctRes.data
                ? { username: acctRes.data.username as string, lastStatus: (acctRes.data.last_status as string) ?? null }
                : null
            }
            hasCalendarICloud={!!calRes.data}
            pending={pending}
            pendingTotal={pendingRes.count ?? pending.length}
          />
          <PeopleImport />
        </div>
        <PeopleBrowser contacts={contacts} />
      </div>
    </div>
  );
}
