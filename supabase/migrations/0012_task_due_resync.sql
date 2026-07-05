-- ===========================================================================
-- 0012_task_due_resync.sql — Reminder re-sync flag.
-- When a task's deadline changes after its reminder was already exported,
-- the old reminder must be removed and a fresh one (with the new alert)
-- re-added — Shortcuts cannot edit reminders in place. The flag routes the
-- task through the remove queue once, then back through the add queue.
-- ===========================================================================

alter table tasks add column if not exists reminders_resync boolean not null default false;
