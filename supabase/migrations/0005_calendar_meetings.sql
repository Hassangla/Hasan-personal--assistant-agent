-- ===========================================================================
-- 0005_calendar_meetings.sql — Meetings/calendar with pre-meeting reminders.
-- One-way sync to Google/iOS is served from these rows as an .ics feed.
-- ===========================================================================

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  location text,
  notes text,
  area_id uuid references entities(id),
  person_id uuid references entities(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  remind_minutes_before int not null default 30,
  next_reminder_at timestamptz,          -- when to send the pre-meeting reminder
  reminded boolean not null default false,
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled','done')),
  external_source text not null default 'agent',  -- 'agent' | 'google' | 'ios' (future inbound)
  external_uid text,                     -- for future two-way sync dedupe
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table meetings enable row level security;

create index if not exists meetings_user_start_idx on meetings (user_id, starts_at);
-- The tick scans this for due, not-yet-sent reminders — keep it cheap.
create index if not exists meetings_reminder_idx
  on meetings (next_reminder_at)
  where status = 'scheduled' and reminded = false;

drop trigger if exists meetings_set_updated_at on meetings;
create trigger meetings_set_updated_at
  before update on meetings
  for each row execute function set_updated_at();
