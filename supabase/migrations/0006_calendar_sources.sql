-- ===========================================================================
-- 0006_calendar_sources.sql — Inbound calendar subscriptions.
-- The user publishes their Apple/Google calendar as a read-only .ics URL; the
-- agent imports those events into `meetings` (external_source != 'agent').
-- ===========================================================================

create table if not exists calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  url text not null,
  label text,
  active boolean not null default true,
  last_synced_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);

alter table calendar_sources enable row level security;
create index if not exists calendar_sources_user_idx on calendar_sources (user_id) where active;

-- Dedup key for imported events (one row per source event).
create unique index if not exists meetings_user_extuid_idx
  on meetings (user_id, external_uid)
  where external_uid is not null;
