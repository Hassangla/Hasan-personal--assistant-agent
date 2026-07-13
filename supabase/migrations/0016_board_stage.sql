-- ===========================================================================
-- 0016_board_stage.sql — Kanban lane for the board view.
-- A separate column, NOT a status: "In Progress" is a lane, so follow-ups,
-- timers, and Reminders sync keep treating the task as open. Done remains
-- the real completion status.
-- ===========================================================================

alter table tasks add column if not exists board_stage text not null default 'todo';
