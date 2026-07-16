-- ===========================================================================
-- 0018_task_labels.sql — Named task labels (Urgent, Important, …).
-- A small fixed vocabulary of cross-area tags, separate from the life-area.
-- Stored as a text[] of label keys on the task.
-- ===========================================================================

alter table tasks add column if not exists labels text[] not null default '{}';
create index if not exists tasks_labels_idx on tasks using gin (labels);
