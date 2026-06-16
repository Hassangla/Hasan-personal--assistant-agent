-- ===========================================================================
-- 0002_delegation_and_plans.sql
-- Delegated tasks + short/medium/long-term plans.
-- ===========================================================================

-- A task can be delegated to someone else; the agent keeps following up with
-- the user until they confirm it's fully complete.
alter table tasks add column if not exists delegated_to text;

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  horizon text not null check (horizon in ('short','medium','long')),
  title text not null,
  body text,
  status text not null default 'active' check (status in ('active','done','archived')),
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plans enable row level security;
create index if not exists plans_user_status_idx on plans (user_id, status);
create index if not exists plans_review_idx on plans (next_review_at) where status = 'active';

drop trigger if exists plans_set_updated_at on plans;
create trigger plans_set_updated_at
  before update on plans
  for each row execute function set_updated_at();
