import { getDashboardData } from "@/lib/dashboard/queries";
import { USER_TIMEZONE } from "@/lib/config";
import { Header } from "@/components/app/Header";
import { BoardWorkspace } from "@/components/app/BoardWorkspace";

export const dynamic = "force-dynamic";

// Focus mode: the board on its own full-height page — lanes fill the screen so
// you can concentrate on moving work through, drag on any device by the ⠿ grip.
export default async function BoardPage() {
  const d = await getDashboardData();
  return (
    <div className="flex h-[100dvh] flex-col">
      <Header active="board" pendingCount={d.pendingCount} tz={USER_TIMEZONE} />
      <div className="mx-auto flex min-h-0 w-full max-w-[1240px] flex-1 flex-col">
        <div className="flex items-baseline gap-2.5 px-4 pb-1 pt-4 sm:px-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">Focus</span>
          <h1 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Board</h1>
          <span className="font-mono text-[11px] text-ink3">drag by the ⠿ grip · To Do → In Progress → Done</span>
        </div>
        {d.today.length || d.recentDone.length ? (
          <BoardWorkspace tasks={d.today} done={d.recentDone} lists={d.boardLists} />
        ) : (
          <p className="px-8 py-16 text-center text-[14px] text-ink3">
            No open tasks — capture one from the dashboard or in Chat.
          </p>
        )}
      </div>
    </div>
  );
}
