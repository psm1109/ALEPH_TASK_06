-- Apply to an existing PDS Diary database before deploying the daily
-- completion UI. It is safe to rerun after the earlier daily-completion version.
-- Past completion events and execution logs are preserved; today's unchecked
-- events are removed so today's record follows the current task state.
begin;

alter table public.task_completion_events
  add column if not exists completed_day date;

update public.task_completion_events
set completed_day = (completed_at at time zone 'Asia/Seoul')::date
where completed_day is null;

alter table public.task_completion_events
  alter column completed_day set not null;

alter table public.task_completion_events
  drop constraint if exists task_completion_events_workspace_id_task_id_key;
drop index if exists public.task_completion_events_owner_task_uidx;
create unique index if not exists task_completion_events_owner_task_day_uidx
  on public.task_completion_events (user_id, task_id, completed_day);

create or replace function public.record_task_completion_for_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completion_time timestamptz;
  completion_day date;
begin
  completion_time := coalesce(new.completed_at, now());
  completion_day := (completion_time at time zone 'Asia/Seoul')::date;
  if new.is_completed = true and (
    old.is_completed = false or
    (old.completed_at at time zone 'Asia/Seoul')::date is distinct from completion_day
  ) then
    insert into public.task_completion_events (user_id, workspace_id, task_id, completed_at, completed_day)
    values (new.user_id, new.workspace_id, new.id, completion_time, completion_day)
    on conflict (user_id, task_id, completed_day)
    do update set completed_at = excluded.completed_at;
  elsif old.is_completed = true and new.is_completed = false then
    -- Unchecking today removes today's event. A rollover reset preserves
    -- yesterday's event because its completed_day is earlier than today.
    delete from public.task_completion_events
    where user_id = old.user_id and task_id = old.id
      and completed_day = (now() at time zone 'Asia/Seoul')::date;
  end if;
  return new;
end;
$$;

revoke all on function public.record_task_completion_for_day() from public;

drop trigger if exists tasks_record_completion_once on public.tasks;
drop trigger if exists tasks_record_completion_for_day on public.tasks;
drop function if exists public.record_task_completion_once();
create trigger tasks_record_completion_for_day
after update of is_completed, completed_at on public.tasks
for each row execute function public.record_task_completion_for_day();

-- Restore the latest checked day when the former one-row-per-task rule
-- prevented its event from being stored. Older missing days cannot be inferred.
insert into public.task_completion_events (user_id, workspace_id, task_id, completed_at, completed_day)
select user_id, workspace_id, id, coalesce(completed_at, updated_at, now()),
  (coalesce(completed_at, updated_at, now()) at time zone 'Asia/Seoul')::date
from public.tasks
where is_completed = true
  and user_id is not null
on conflict (user_id, task_id, completed_day) do nothing;

delete from public.task_completion_events e
using public.tasks t
where e.task_id = t.id and e.user_id = t.user_id
  and e.completed_day = (now() at time zone 'Asia/Seoul')::date
  and (t.is_completed = false or
    (t.completed_at at time zone 'Asia/Seoul')::date is distinct from e.completed_day);

commit;
