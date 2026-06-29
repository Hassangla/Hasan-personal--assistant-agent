-- ===========================================================================
-- 0008_task_goals.sql — Link tasks to goals (the `plans` table = goals, by
-- horizon: short / medium / long). Lets the Goals page show how daily work
-- contributes to short- and long-term goals.
-- ===========================================================================

alter table tasks add column if not exists goal_id uuid references plans(id);
create index if not exists tasks_goal_idx on tasks (goal_id) where goal_id is not null;
