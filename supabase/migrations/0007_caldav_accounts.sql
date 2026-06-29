-- ===========================================================================
-- 0007_caldav_accounts.sql — Direct CalDAV sync (iCloud).
-- The app-specific password is stored AES-256-GCM encrypted (key derived from
-- AUTH_SECRET); the agent reads the user's calendars and imports VEVENTs into
-- `meetings` (external_source='icloud').
-- ===========================================================================

create table if not exists caldav_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  server text not null default 'https://caldav.icloud.com',
  username text not null,             -- Apple ID email
  password_enc text not null,         -- app-specific password, encrypted at rest
  home_url text,                      -- discovered calendar-home-set
  calendars jsonb,                    -- discovered [{ url, name }]
  active boolean not null default true,
  last_synced_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);

alter table caldav_accounts enable row level security;
create index if not exists caldav_accounts_user_idx on caldav_accounts (user_id) where active;
