import { supabaseAdmin } from "@/lib/supabase/server";
import { USER_ID, USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { ChatThread } from "@/components/app/ChatThread";

export const dynamic = "force-dynamic";

// The agent's direct line — the Telegram replacement. Full-height flex layout:
// header, scrolling thread, composer pinned at the bottom (100dvh keeps it
// above the iOS keyboard in the installed app).
export default async function ChatPage() {
  const { count } = await supabaseAdmin()
    .from("confirmations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID)
    .eq("status", "pending");

  return (
    <div className="flex h-[100dvh] flex-col">
      <Header active="chat" pendingCount={count ?? 0} tz={USER_TIMEZONE} />
      <div className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col">
        <ChatThread />
      </div>
    </div>
  );
}
