-- Run this once AFTER creating the owner's Supabase Auth account.
-- 1. Replace OWNER_EMAIL@example.com with the owner's email address in both places.
-- 2. Run in the Supabase SQL Editor.
-- 3. Do not put a password, access token, service-role key, or JWT in this file.

do $$
declare
  owner_email text := 'OWNER_EMAIL@example.com';
  owner_id uuid;
begin
  if owner_email = 'OWNER_EMAIL@example.com' then
    raise exception 'Replace OWNER_EMAIL@example.com before running this migration.';
  end if;

  select id
  into owner_id
  from auth.users
  where lower(email) = lower(owner_email);

  if owner_id is null then
    raise exception 'No Supabase Auth account exists for the supplied email.';
  end if;

  update public.plan_versions set user_id = owner_id
  where workspace_id = 'pds-main' and user_id is null;
  update public.reflections set user_id = owner_id
  where workspace_id = 'pds-main' and user_id is null;
  update public.tasks set user_id = owner_id
  where workspace_id = 'pds-main' and user_id is null;
  update public.task_execution_logs set user_id = owner_id
  where workspace_id = 'pds-main' and user_id is null;
  update public.task_completion_events set user_id = owner_id
  where workspace_id = 'pds-main' and user_id is null;

  if exists (
    select 1 from public.plan_versions where workspace_id = 'pds-main' and user_id is null
    union all
    select 1 from public.reflections where workspace_id = 'pds-main' and user_id is null
    union all
    select 1 from public.tasks where workspace_id = 'pds-main' and user_id is null
    union all
    select 1 from public.task_execution_logs where workspace_id = 'pds-main' and user_id is null
    union all
    select 1 from public.task_completion_events where workspace_id = 'pds-main' and user_id is null
  ) then
    raise exception 'Some pds-main rows are still missing an owner. Transaction cancelled.';
  end if;
end $$;

alter table public.plan_versions alter column user_id set not null;
alter table public.reflections alter column user_id set not null;
alter table public.tasks alter column user_id set not null;
alter table public.task_execution_logs alter column user_id set not null;
alter table public.task_completion_events alter column user_id set not null;

-- Evidence query: counts only, with no password, token, or secret value.
select
  u.email,
  (select count(*) from public.plan_versions p where p.user_id = u.id and p.workspace_id = 'pds-main') as plan_versions,
  (select count(*) from public.tasks t where t.user_id = u.id and t.workspace_id = 'pds-main') as tasks,
  (select count(*) from public.task_execution_logs l where l.user_id = u.id and l.workspace_id = 'pds-main') as execution_logs,
  (select count(*) from public.reflections r where r.user_id = u.id and r.workspace_id = 'pds-main') as reflections
from auth.users u
where lower(u.email) = lower('OWNER_EMAIL@example.com');
