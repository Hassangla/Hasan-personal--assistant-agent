-- ===========================================================================
-- 0010_task_files.sql — File attachments on tasks.
-- Files live in the private "task-files" storage bucket (service-role access
-- only; downloads via short-lived signed URLs). This table is the metadata.
-- ===========================================================================

create table if not exists task_files (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  task_id uuid not null references tasks(id) on delete cascade,
  name text not null,
  path text not null,
  size_bytes bigint not null default 0,
  mime text,
  created_at timestamptz not null default now()
);

alter table task_files enable row level security;
create index if not exists task_files_task_idx on task_files (task_id);

insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', false)
on conflict (id) do nothing;
