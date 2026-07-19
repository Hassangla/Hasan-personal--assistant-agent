"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin, CheckSquare } from "lucide-react";
import { areaMeta } from "@/lib/areas";
import type { CalEvent } from "@/lib/dashboard/calendar";

// Outlook-style calendar: Month / Week / Day / Agenda over the user's meetings
// and deadline-bearing tasks. Uses the device's local time (the user's own
// timezone on their own device). Task chips open the task detail panel.

type View = "month" | "week" | "day" | "agenda";
type Ev = Omit<CalEvent, "startIso" | "endIso"> & { start: Date; end: Date; timed: boolean };

const HOUR = 46; // px per hour in the time grid
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay()); // Sunday
const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function eventColor(e: Ev): string {
  if (e.area) return areaMeta(e.area).color;
  return e.kind === "task" ? "#F3B24C" : "#5C8DF0";
}

export function CalendarView({ events, tz }: { events: CalEvent[]; tz: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = window.localStorage.getItem("pa-cal-view");
    if (v === "week" || v === "day" || v === "agenda" || v === "month") setView(v);
  }, []);
  function switchView(v: View) {
    setView(v);
    try {
      window.localStorage.setItem("pa-cal-view", v);
    } catch {
      /* private mode */
    }
  }

  const evs: Ev[] = useMemo(
    () =>
      events.map((e) => {
        const start = new Date(e.startIso);
        const end = e.endIso ? new Date(e.endIso) : new Date(start.getTime() + 30 * 60000);
        return { ...e, start, end, timed: !e.allDay } as Ev;
      }),
    [events],
  );

  const today = startOfDay(new Date());
  const openTask = (e: Ev) => {
    if (e.kind === "task") router.push(`/?task=${e.id.replace(/^t-/, "")}`);
  };

  // scroll the time grid to ~7am on week/day open
  useEffect(() => {
    if ((view === "week" || view === "day") && gridRef.current) gridRef.current.scrollTop = 7 * HOUR - 12;
  }, [view, cursor]);

  function move(dir: -1 | 1) {
    if (view === "month") setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    else if (view === "week") setCursor((c) => addDays(c, 7 * dir));
    else setCursor((c) => addDays(c, dir)); // day + agenda step by day
  }

  const label = useMemo(() => {
    if (view === "month") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.getDate()} ${MONTHS[s.getMonth()]!.slice(0, 3)} – ${e.getDate()} ${MONTHS[e.getMonth()]!.slice(0, 3)} ${e.getFullYear()}`;
    }
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(cursor);
  }, [view, cursor]);

  const dayEvents = (d: Date) =>
    evs.filter((e) => sameDay(e.start, d)).sort((a, b) => (a.allDay === b.allDay ? a.start.getTime() - b.start.getTime() : a.allDay ? -1 : 1));

  const btn = "rounded-[8px] border border-line bg-card px-2 py-1.5 text-ink2 transition hover:border-[#3A3F47] hover:text-ink";
  const viewBtn = (v: View) =>
    `rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition ${
      view === v ? "bg-card text-ink shadow-[0_1px_3px_rgba(0,0,0,0.3)]" : "text-ink3 hover:text-ink"
    }`;

  return (
    <div className="flex flex-col">
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setCursor(startOfDay(new Date()))} className="rounded-[8px] border border-line bg-card px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition hover:border-[#3A3F47] hover:text-ink">
          Today
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} className={btn} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => move(1)} className={btn} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] font-bold tracking-[-0.01em] text-inkstrong sm:text-[19px]">
          {label}
        </h2>
        <div className="inline-flex items-center gap-0.5 rounded-[9px] bg-line2 p-0.5">
          {(["month", "week", "day", "agenda"] as View[]).map((v) => (
            <button key={v} onClick={() => switchView(v)} className={viewBtn(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {view === "month" && <MonthGrid cursor={cursor} today={today} dayEvents={dayEvents} onDay={(d) => { setCursor(d); switchView("day"); }} onEvent={openTask} />}
      {view === "week" && <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))} today={today} dayEvents={dayEvents} gridRef={gridRef} onEvent={openTask} />}
      {view === "day" && <TimeGrid days={[cursor]} today={today} dayEvents={dayEvents} gridRef={gridRef} onEvent={openTask} />}
      {view === "agenda" && <Agenda from={cursor} evs={evs} onEvent={openTask} />}
    </div>
  );
}

// ——— Month ———
function MonthGrid({
  cursor,
  today,
  dayEvents,
  onDay,
  onEvent,
}: {
  cursor: Date;
  today: Date;
  dayEvents: (d: Date) => Ev[];
  onDay: (d: Date) => void;
  onEvent: (e: Ev) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="overflow-hidden rounded-[14px] border border-line2">
      <div className="grid grid-cols-7 border-b border-line2 bg-cardalt">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-inkfaint">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          const list = dayEvents(d);
          return (
            <button
              key={i}
              onClick={() => onDay(d)}
              className={`flex min-h-[92px] flex-col items-stretch gap-0.5 border-b border-r border-line2 p-1 text-left transition hover:bg-cardalt ${
                (i + 1) % 7 === 0 ? "border-r-0" : ""
              } ${inMonth ? "" : "bg-[#0f1013]"}`}
            >
              <span
                className={`mb-0.5 inline-flex h-[20px] w-[20px] items-center justify-center self-end rounded-full text-[11.5px] font-semibold ${
                  isToday ? "bg-accent text-[#0C0D10]" : inMonth ? "text-ink2" : "text-inkfaint"
                }`}
              >
                {d.getDate()}
              </span>
              {list.slice(0, 3).map((e) => (
                <span
                  key={e.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onEvent(e);
                  }}
                  style={{ background: eventColor(e) + "22", color: eventColor(e) }}
                  className="truncate rounded-[4px] px-1 py-px text-[10.5px] font-medium leading-tight"
                >
                  {!e.allDay && <span className="font-mono opacity-80">{hm(e.start)} </span>}
                  {e.title}
                </span>
              ))}
              {list.length > 3 && <span className="px-1 text-[10px] font-semibold text-ink3">+{list.length - 3} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ——— Week / Day time grid ———
function TimeGrid({
  days,
  today,
  dayEvents,
  gridRef,
  onEvent,
}: {
  days: Date[];
  today: Date;
  dayEvents: (d: Date) => Ev[];
  gridRef: React.RefObject<HTMLDivElement | null>;
  onEvent: (e: Ev) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="overflow-hidden rounded-[14px] border border-line2">
      {/* day headers */}
      <div className="flex border-b border-line2 bg-cardalt">
        <div className="w-[52px] shrink-0" />
        {days.map((d) => {
          const isToday = sameDay(d, today);
          const allDay = dayEvents(d).filter((e) => e.allDay);
          return (
            <div key={d.toISOString()} className="min-w-0 flex-1 border-l border-line2 px-1 py-1.5">
              <div className="text-center">
                <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-inkfaint">{WEEKDAYS[d.getDay()]}</div>
                <div
                  className={`mx-auto mt-0.5 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px] font-bold ${
                    isToday ? "bg-accent text-[#0C0D10]" : "text-ink"
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
              {allDay.map((e) => (
                <span
                  key={e.id}
                  onClick={() => onEvent(e)}
                  style={{ background: eventColor(e) + "22", color: eventColor(e) }}
                  className="mt-1 block cursor-pointer truncate rounded-[4px] px-1 py-px text-[10.5px] font-medium"
                >
                  {e.kind === "task" ? "◇ " : ""}
                  {e.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {/* time grid */}
      <div ref={gridRef} className="max-h-[560px] overflow-y-auto">
        <div className="relative flex">
          {/* hour labels */}
          <div className="w-[52px] shrink-0">
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR }} className="relative">
                <span className="absolute -top-1.5 right-1.5 font-mono text-[9.5px] text-inkfaint">
                  {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              </div>
            ))}
          </div>
          {/* day columns */}
          {days.map((d) => {
            const timed = dayEvents(d).filter((e) => !e.allDay);
            return (
              <div key={d.toISOString()} className="relative min-w-0 flex-1 border-l border-line2">
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR }} className="border-b border-line2/60" />
                ))}
                {sameDay(d, today) && <NowLine />}
                {timed.map((e) => {
                  const top = (e.start.getHours() * 60 + e.start.getMinutes()) / 60 * HOUR;
                  const mins = Math.max(24, (e.end.getTime() - e.start.getTime()) / 60000);
                  const height = Math.max(20, (mins / 60) * HOUR - 2);
                  const col = eventColor(e);
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEvent(e)}
                      style={{ top, height, background: col + "26", borderColor: col }}
                      className="absolute inset-x-1 overflow-hidden rounded-[6px] border-l-[3px] px-1.5 py-0.5 text-left"
                    >
                      <div className="truncate text-[11px] font-semibold" style={{ color: col }}>
                        {e.title}
                      </div>
                      <div className="truncate font-mono text-[9px] text-ink3">{hm(e.start)}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const top = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR;
  return (
    <div style={{ top }} className="pointer-events-none absolute inset-x-0 z-10 flex items-center">
      <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
      <span className="h-px flex-1 bg-danger" />
    </div>
  );
}

// ——— Agenda ———
function Agenda({ from, evs, onEvent }: { from: Date; evs: Ev[]; onEvent: (e: Ev) => void }) {
  const upcoming = evs
    .filter((e) => e.start.getTime() >= startOfDay(from).getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 60);
  const byDay = new Map<string, Ev[]>();
  for (const e of upcoming) {
    const k = startOfDay(e.start).toISOString();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(e);
  }
  if (upcoming.length === 0) {
    return <p className="rounded-[14px] border border-line2 py-10 text-center text-[14px] text-ink3">Nothing scheduled from here on.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {[...byDay.entries()].map(([k, list]) => {
        const d = new Date(k);
        return (
          <div key={k} className="flex gap-3">
            <div className="w-[52px] shrink-0 pt-0.5 text-right">
              <div className="font-display text-[20px] font-bold leading-none text-inkstrong">{d.getDate()}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-inkfaint">{WEEKDAYS[d.getDay()]}</div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {list.map((e) => {
                const col = eventColor(e);
                return (
                  <button
                    key={e.id}
                    onClick={() => onEvent(e)}
                    className="flex w-full items-center gap-2.5 rounded-[10px] border border-line2 bg-card px-3 py-2 text-left transition hover:border-[#3A3F47]"
                  >
                    <span style={{ background: col }} className="h-2 w-2 shrink-0 rounded-full" />
                    <span className="w-[76px] shrink-0 font-mono text-[11px] text-ink3">{e.allDay ? "All day" : hm(e.start)}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-inkstrong">{e.title}</span>
                    {e.kind === "task" && <CheckSquare className="h-3.5 w-3.5 shrink-0 text-amber" strokeWidth={2} />}
                    {e.location && (
                      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-ink3 sm:flex">
                        <MapPin className="h-3 w-3" /> {e.location}
                      </span>
                    )}
                    {e.area && <span style={{ color: areaMeta(e.area).color }} className="shrink-0 text-[11px] font-semibold">{areaMeta(e.area).label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
