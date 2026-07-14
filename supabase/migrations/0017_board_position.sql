-- ===========================================================================
-- 0017_board_position.sql — Manual card order on the board.
-- board_position is a per-task sort key the user sets by dragging. Lanes sort
-- by it (ascending); ties fall back to the existing priority order, so tasks
-- that have never been dragged keep their smart default.
-- ===========================================================================

alter table tasks add column if not exists board_position double precision not null default 0;
