-- ===========================================================================
-- 0003_email_crm.sql — AgentMail inbound emails + contact lookup.
-- Email content is UNTRUSTED: summarized/extracted only, never acted on
-- without explicit user approval.
-- ===========================================================================

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  inbox_id text,
  thread_id text,
  message_id text,
  from_email text,
  from_name text,
  to_addrs jsonb,
  cc_addrs jsonb,
  subject text,
  preview text,
  body_text text,
  summary text,
  classification jsonb,
  area_id uuid references entities(id),
  person_id uuid references entities(id),
  received_at timestamptz,
  created_at timestamptz not null default now()
);

alter table emails enable row level security;
create unique index if not exists emails_message_id_idx on emails (message_id) where message_id is not null;
create index if not exists emails_user_created_idx on emails (user_id, created_at desc);

create index if not exists entities_person_email_idx
  on entities ((lower(metadata->>'email'))) where kind = 'person';
