-- ===========================================================================
-- 0014_notifications.sql — Notification tracker (the bell).
-- Every proactive send (task nudge, meeting alert, test) is logged here so
-- the user can always answer "what was that notification about?". read_at
-- drives the unread badge.
-- ===========================================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null, -- task_nudge | meeting | test | system
  title text not null,
  body text,
  url text,
  resource_type text,
  resource_id text,
  channels text, -- e.g. "telegram+push"
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;
create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where read_at is null;
