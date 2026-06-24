-- ===========================================================================
-- 0004_followup_priority_order.sql
-- Process the highest-priority due tasks first (deterministic, not "random").
-- Folded into 0001's claim_due_tasks for fresh deploys; this file records the
-- change for the existing database lineage.
-- ===========================================================================

create or replace function claim_due_tasks(p_user_id text, p_limit int default 25)
returns setof tasks
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
    order by priority_score desc, next_nudge_at asc
    limit p_limit
    for update skip locked
  loop
    update public.tasks
      set next_nudge_at = now() + interval '5 minutes'
      where id = r.id;
    return next r;
  end loop;
end;
$$;
