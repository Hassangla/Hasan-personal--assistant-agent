"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, User, Target, CheckSquare } from "lucide-react";

// Global search in the header: type to search tasks, people, and goals across
// the app; click a result to jump to it. Debounced; closes on outside click.
type Results = {
  tasks: { id: string; title: string; done: boolean }[];
  people: { id: string; name: string }[];
  goals: { id: string; title: string }[];
};
const EMPTY: Results = { tasks: [], people: [], goals: [] };

export function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setRes(EMPTY);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const j = await fetch(`/api/search?q=${encodeURIComponent(s)}`).then((r) => r.json());
        setRes({ tasks: j.tasks ?? [], people: j.people ?? [], goals: j.goals ?? [] });
      } catch {
        setRes(EMPTY);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(url: string) {
    setOpen(false);
    setQ("");
    router.push(url);
  }

  const total = res.tasks.length + res.people.length + res.goals.length;
  const row = "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-cardalt";

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-ink3" strokeWidth={2} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search…"
          className="w-[130px] rounded-[9px] border border-line bg-card py-1.5 pl-8 pr-2 text-[12.5px] text-ink outline-none transition focus:w-[200px] focus:border-[#3A3F47]"
        />
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-[38px] z-50 w-[300px] max-w-[86vw] overflow-hidden rounded-[12px] border border-line bg-card shadow-[0_18px_44px_-12px_rgba(0,0,0,0.6)]">
          {loading && total === 0 ? (
            <p className="px-3 py-4 text-center text-[12.5px] text-ink3">Searching…</p>
          ) : total === 0 ? (
            <p className="px-3 py-4 text-center text-[12.5px] text-ink3">No matches for “{q.trim()}”.</p>
          ) : (
            <div className="max-h-[380px] overflow-y-auto py-1">
              {res.tasks.length > 0 && (
                <>
                  <div className="px-3 pb-0.5 pt-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-inkfaint">Tasks</div>
                  {res.tasks.map((t) => (
                    <button key={t.id} onClick={() => go(`${pathname}?task=${t.id}`)} className={row}>
                      <CheckSquare className={`h-4 w-4 shrink-0 ${t.done ? "text-good" : "text-inkfaint"}`} strokeWidth={2} />
                      <span className={`min-w-0 flex-1 truncate ${t.done ? "text-ink3 line-through" : "text-inkstrong"}`}>
                        {t.title}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {res.people.length > 0 && (
                <>
                  <div className="px-3 pb-0.5 pt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-inkfaint">People</div>
                  {res.people.map((p) => (
                    <button key={p.id} onClick={() => go(`/people`)} className={row}>
                      <User className="h-4 w-4 shrink-0 text-ink3" strokeWidth={2} />
                      <span className="min-w-0 flex-1 truncate text-inkstrong">{p.name}</span>
                    </button>
                  ))}
                </>
              )}
              {res.goals.length > 0 && (
                <>
                  <div className="px-3 pb-0.5 pt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-inkfaint">Goals</div>
                  {res.goals.map((g) => (
                    <button key={g.id} onClick={() => go(`/goals`)} className={row}>
                      <Target className="h-4 w-4 shrink-0 text-ink3" strokeWidth={2} />
                      <span className="min-w-0 flex-1 truncate text-inkstrong">{g.title}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
