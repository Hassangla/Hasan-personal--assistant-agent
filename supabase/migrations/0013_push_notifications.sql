-- ===========================================================================
-- 0013_push_notifications.sql — Web Push (iPhone/iPad/desktop PWA).
-- push_subscriptions: one row per device that enabled notifications.
-- app_config: small server-side key/value store — holds the VAPID keypair,
-- generated lazily on first use so no manual env setup is needed.
-- ===========================================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create index if not exists push_subs_user_idx on push_subscriptions (user_id);

create table if not exists app_config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table app_config enable row level security;
