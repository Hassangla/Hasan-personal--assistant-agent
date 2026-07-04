-- ===========================================================================
-- 0011_task_checklists.sql — Checklist items inside tasks.
-- Each item can carry its own deadline and label (label = area, consistent
-- with the rest of the platform). Cascade with the parent task.
-- ===========================================================================

create table if not exists task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  area_id uuid,
  done boolean not null default false,
  completed_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table task_checklist_items enable row level security;
create index if not exists task_checklist_task_idx on task_checklist_items (task_id);
