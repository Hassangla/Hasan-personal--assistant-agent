-- ===========================================================================
-- 0001_init.sql — Personal Agent foundation schema
--
-- Agent-shaped schema. `tasks` carries the follow-up state machine; the
-- operational tables (agent_events, messages, confirmations, audit_log,
-- scheduled_jobs) are what make this an agent rather than a tracker.
--
-- RLS is deny-all on every table. The server uses the service-role client,
-- which bypasses RLS. There is no client-side data access in Part 0.
-- ===========================================================================

create extension if not exists vector;

-- --- updated_at helper --------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --- People, projects, life areas, orgs all live here -------------------------
create table entities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('person','project','area','org')),
  name text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- --- Raw intake — never lose the original ------------------------------------
create table captures (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text,
  raw_text text,
  audio_url text,
  classification jsonb,
  routed_to text,
  routed_id uuid,
  created_at timestamptz not null default now()
);

-- --- Tasks WITH the follow-up state machine ----------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  area_id uuid references entities(id),
  person_id uuid references entities(id),
  status text not null default 'open'
    check (status in ('open','reminded','escalated','snoozed','done','dropped')),
  priority_score numeric not null default 0,
  urgency text,
  due_at timestamptz,
  next_nudge_at timestamptz,        -- when the loop should next chase this
  nudge_count int not null default 0,
  escalation_level int not null default 0,  -- 0 gentle, rises with each ignored nudge
  last_nudged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- --- Five life areas + daily check-ins ---------------------------------------
create table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  area_id uuid references entities(id),
  checkin_date date not null,
  prompt text,
  response text,
  structured jsonb,
  created_at timestamptz not null default now()
);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  area_id uuid references entities(id),
  target_per_day int not null default 1,
  active boolean not null default true
);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  habit_id uuid references habits(id),
  log_date date not null,
  count int not null default 0,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  amount numeric,
  currency text not null default 'USD',
  category text,
  note text,
  spent_at timestamptz not null default now(),
  source_capture_id uuid references captures(id)
);

-- --- Relationship touches (people are entities of kind='person') -------------
create table interactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  person_id uuid references entities(id),
  kind text,
  summary text,
  occurred_at timestamptz not null default now(),
  next_touch_at timestamptz         -- when the agent should remind you to reconnect
);

-- --- Ambient memory -----------------------------------------------------------
create table memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_type text,
  source_id uuid,
  text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- AGENT OPERATIONAL TABLES
-- ===========================================================================

create table agent_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text,                        -- 'tick'|'inbound'|'email'|'calendar'
  payload jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- conversation history per channel
create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  channel text not null default 'telegram',
  role text not null check (role in ('user','assistant','tool')),
  content text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

-- pending irreversible actions awaiting approval
create table confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action_type text not null,
  payload jsonb,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- everything the agent did, attributable + reversible where possible
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  actor text not null default 'agent',
  action text,
  resource_type text,
  resource_id uuid,
  payload jsonb,
  reversible boolean not null default false,
  undo_payload jsonb,
  created_at timestamptz not null default now()
);

-- recurring proactive behaviours
create table scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text,                        -- 'checkin'|'digest'|'review'
  config jsonb,
  next_run_at timestamptz,
  active boolean not null default true
);

-- ===========================================================================
-- INDEXES
-- ===========================================================================

-- Vector similarity over ambient memory.
create index memory_chunks_embedding_idx
  on memory_chunks using hnsw (embedding vector_cosine_ops);

-- The follow-up loop scans this constantly — keep it cheap.
create index tasks_next_nudge_idx
  on tasks (next_nudge_at)
  where status in ('open','reminded','escalated');

create index tasks_user_status_idx on tasks (user_id, status);
create index interactions_next_touch_idx on interactions (next_touch_at);
create index scheduled_jobs_next_run_idx on scheduled_jobs (next_run_at) where active;
create index messages_user_created_idx on messages (user_id, created_at desc);
create index confirmations_status_idx on confirmations (user_id, status);
create index captures_user_created_idx on captures (user_id, created_at desc);
create index entities_user_kind_idx on entities (user_id, kind);

-- ===========================================================================
-- RLS — deny-all. The service-role client bypasses these; nothing else gets in.
-- ===========================================================================
alter table entities       enable row level security;
alter table captures       enable row level security;
alter table tasks          enable row level security;
alter table checkins       enable row level security;
alter table habits         enable row level security;
alter table habit_logs     enable row level security;
alter table expenses       enable row level security;
alter table interactions   enable row level security;
alter table memory_chunks  enable row level security;
alter table agent_events   enable row level security;
alter table messages       enable row level security;
alter table confirmations  enable row level security;
alter table audit_log      enable row level security;
alter table scheduled_jobs enable row level security;

-- ===========================================================================
-- FUNCTIONS
-- ===========================================================================

-- Ambient-memory retrieval: top-N memory chunks by cosine similarity.
create or replace function match_memory_chunks(
  p_user_id text,
  query_embedding public.vector(1536),
  match_count int default 12
)
returns table (
  id uuid,
  text text,
  source_type text,
  source_id uuid,
  similarity float
)
language sql stable
set search_path = ''
as $$
  select
    mc.id,
    mc.text,
    mc.source_type,
    mc.source_id,
    1 - (mc.embedding operator(public.<=>) query_embedding) as similarity
  from public.memory_chunks mc
  where mc.user_id = p_user_id
    and mc.embedding is not null
  order by mc.embedding operator(public.<=>) query_embedding
  limit match_count;
$$;

-- Claim-then-act for follow-ups: select due tasks, lock them, and tentatively
-- push next_nudge_at out so a concurrent tick can't grab the same row. The
-- follow-up transition then writes the real next_nudge_at. Prevents nudge
-- storms and double-sending (spec pitfalls #1, #2).
create or replace function claim_due_tasks(p_user_id text, p_limit int default 25)
returns setof public.tasks
language plpgsql
set search_path = ''
as $$
declare
  r public.tasks%rowtype;
begin
  for r in
    select * from public.tasks
    where user_id = p_user_id
      and next_nudge_at is not null
      and next_nudge_at <= now()
      and status in ('open','reminded','escalated')
    order by next_nudge_at asc
    limit p_limit
    for update skip locked
  loop
    update public.tasks
      set next_nudge_at = now() + interval '5 minutes'
      where id = r.id;
    return next r;   -- pre-update snapshot drives the transition logic
  end loop;
end;
$$;

-- Claim-then-act for stale relationships.
create or replace function claim_due_interactions(p_user_id text, p_limit int default 25)
returns setof public.interactions
language plpgsql
set search_path = ''
as $$
declare
  r public.interactions%rowtype;
begin
  for r in
    select * from public.interactions
    where user_id = p_user_id
      and next_touch_at is not null
      and next_touch_at <= now()
    order by next_touch_at asc
    limit p_limit
    for update skip locked
  loop
    update public.interactions
      set next_touch_at = now() + interval '1 day'
      where id = r.id;
    return next r;
  end loop;
end;
$$;

-- Claim-then-act for scheduled jobs.
create or replace function claim_due_jobs(p_user_id text, p_limit int default 25)
returns setof public.scheduled_jobs
language plpgsql
set search_path = ''
as $$
declare
  r public.scheduled_jobs%rowtype;
begin
  for r in
    select * from public.scheduled_jobs
    where user_id = p_user_id
      and active
      and next_run_at is not null
      and next_run_at <= now()
    order by next_run_at asc
    limit p_limit
    for update skip locked
  loop
    update public.scheduled_jobs
      set next_run_at = now() + interval '10 minutes'
      where id = r.id;
    return next r;
  end loop;
end;
$$;

-- Expire pending confirmations older than the cutoff so stale approvals can't
-- fire later (spec pitfall #5). Returns the number expired.
create or replace function expire_stale_confirmations(p_user_id text, p_max_age interval default interval '24 hours')
returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  update public.confirmations
    set status = 'expired', resolved_at = now()
    where user_id = p_user_id
      and status = 'pending'
      and created_at < now() - p_max_age;
  get diagnostics n = row_count;
  return n;
end;
$$;
