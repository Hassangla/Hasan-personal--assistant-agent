-- ===========================================================================
-- 0009_reminders_sync.sql — Two-way Apple Reminders sync state.
-- Platform → Reminders: reminders_exported_at marks a task already handed to
-- the iOS Shortcut (and reminders_removed_at that its completion/deletion has
-- been propagated). Reminders → platform: reminders_key stores the Apple
-- reminder's creation timestamp (stable across renames) so re-pushes dedup.
-- ===========================================================================

alter table tasks add column if not exists reminders_key text;
alter table tasks add column if not exists reminders_exported_at timestamptz;
alter table tasks add column if not exists reminders_removed_at timestamptz;

create unique index if not exists tasks_reminders_key_uidx
  on tasks (user_id, reminders_key)
  where reminders_key is not null;
