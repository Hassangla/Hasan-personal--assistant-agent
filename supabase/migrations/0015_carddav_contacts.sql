-- ===========================================================================
-- 0015_carddav_contacts.sql — Live iCloud Contacts sync (CardDAV, pull-only).
-- carddav_accounts mirrors caldav_accounts (same app-password pattern).
-- carddav_contacts is both the link table (remote UID ↔ CRM person) and the
-- review inbox: unknown contacts arrive as status 'pending' for approval —
-- the CRM stays curated, nothing floods in silently.
-- ===========================================================================

create table if not exists carddav_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  server text not null,
  username text not null,
  password_enc text not null,
  home_url text,
  addressbooks jsonb,
  active boolean not null default true,
  last_synced_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);
alter table carddav_accounts enable row level security;
create index if not exists carddav_accounts_user_idx on carddav_accounts (user_id) where active;

create table if not exists carddav_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid not null references carddav_accounts(id) on delete cascade,
  remote_uid text not null,
  etag text,
  name text,
  payload jsonb,
  status text not null default 'pending', -- pending | linked | dismissed
  entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, remote_uid)
);
alter table carddav_contacts enable row level security;
create index if not exists carddav_contacts_pending_idx on carddav_contacts (user_id) where status = 'pending';
