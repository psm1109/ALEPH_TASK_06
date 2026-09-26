-- Card 3: reject a revoked Supabase Auth session immediately.
-- Run this after supabase/schema.sql has created the five diary tables.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_auth_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions
    where auth.sessions.id::text = nullif(auth.jwt() ->> 'session_id', '')
      and auth.sessions.user_id = auth.uid()
  );
$$;

revoke all on function private.is_auth_session_active() from public;
grant execute on function private.is_auth_session_active() to authenticated;

create or replace function private.check_auth_session()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' and not private.is_auth_session_active() then
    raise insufficient_privilege using
      message = 'The authentication session is no longer active.';
  end if;
end;
$$;

revoke all on function private.check_auth_session() from public;
grant execute on function private.check_auth_session() to authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'private.check_auth_session';
notify pgrst, 'reload config';

drop policy if exists "owner plan versions read" on public.plan_versions;
drop policy if exists "owner plan versions insert" on public.plan_versions;
drop policy if exists "owner reflections all" on public.reflections;
drop policy if exists "owner tasks all" on public.tasks;
drop policy if exists "owner task execution logs all" on public.task_execution_logs;
drop policy if exists "owner task completion events read" on public.task_completion_events;

create policy "owner plan versions read"
  on public.plan_versions for select to authenticated
  using (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
  );

create policy "owner plan versions insert"
  on public.plan_versions for insert to authenticated
  with check (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
  );

create policy "owner reflections all"
  on public.reflections for all to authenticated
  using (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
  )
  with check (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
  );

create policy "owner tasks all"
  on public.tasks for all to authenticated
  using (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
  )
  with check (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
  );

create policy "owner task execution logs all"
  on public.task_execution_logs for all to authenticated
  using (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
  )
  with check (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.tasks
      where tasks.id = task_execution_logs.task_id
        and tasks.user_id = auth.uid()
    )
  );

create policy "owner task completion events read"
  on public.task_completion_events for select to authenticated
  using (
    (select private.is_auth_session_active())
    and auth.uid() is not null
    and user_id = auth.uid()
  );
