-- Server-enforced login throttling for the auth-gateway Edge Function.
-- Run this file in the hosted project's SQL Editor before deploying the
-- matching auth-gateway version. Raw email addresses and IP addresses are
-- never stored; the Edge Function sends only server-keyed HMAC hashes.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.auth_login_throttle (
  scope text not null check (scope in ('account', 'ip')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  failure_count integer not null default 0 check (failure_count >= 0),
  next_allowed_at timestamptz,
  locked_until timestamptz,
  last_failed_at timestamptz,
  primary key (scope, subject_hash)
);

create index if not exists auth_login_throttle_last_failed_idx
  on private.auth_login_throttle (last_failed_at);

revoke all on table private.auth_login_throttle from public, anon, authenticated;

create or replace function private.auth_login_throttle_delay_seconds(p_failure_count integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_failure_count
    when 3 then 2
    when 4 then 5
    when 5 then 15
    when 6 then 30
    when 7 then 60
    when 8 then 120
    else 0
  end;
$$;

create or replace function private.auth_login_throttle_record_one(
  p_scope text,
  p_subject_hash text,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.auth_login_throttle%rowtype;
  v_block_until timestamptz;
  v_failure_count integer;
  v_delay_seconds integer;
begin
  if p_scope not in ('account', 'ip') or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid login throttle subject';
  end if;

  insert into private.auth_login_throttle (scope, subject_hash)
  values (p_scope, p_subject_hash)
  on conflict (scope, subject_hash) do nothing;

  select * into v_row
  from private.auth_login_throttle
  where scope = p_scope and subject_hash = p_subject_hash
  for update;

  v_block_until := greatest(v_row.next_allowed_at, v_row.locked_until);
  if v_block_until is not null and v_block_until > p_now then
    -- Retrying during a cooldown never increases the count or extends the end.
    return;
  end if;

  v_failure_count := case
    when v_row.last_failed_at is null or v_row.last_failed_at < p_now - interval '24 hours' then 1
    else v_row.failure_count + 1
  end;
  v_delay_seconds := private.auth_login_throttle_delay_seconds(v_failure_count);

  update private.auth_login_throttle
  set failure_count = v_failure_count,
      next_allowed_at = case
        when v_failure_count >= 9 then p_now + interval '15 minutes'
        when v_delay_seconds > 0 then p_now + make_interval(secs => v_delay_seconds)
        else null
      end,
      locked_until = case
        when v_failure_count >= 9 then p_now + interval '15 minutes'
        else null
      end,
      last_failed_at = p_now
  where scope = p_scope and subject_hash = p_subject_hash;
end;
$$;

create or replace function public.auth_login_throttle_check(
  p_account_hash text,
  p_ip_hash text default null
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_block_until timestamptz;
begin
  if p_account_hash !~ '^[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid login throttle subject';
  end if;

  select max(greatest(next_allowed_at, locked_until))
  into v_block_until
  from private.auth_login_throttle
  where (scope = 'account' and subject_hash = p_account_hash)
     or (p_ip_hash is not null and scope = 'ip' and subject_hash = p_ip_hash);

  allowed := v_block_until is null or v_block_until <= v_now;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_block_until - v_now)))::integer)
  end;
  return next;
end;
$$;

create or replace function public.auth_login_throttle_fail(
  p_account_hash text,
  p_ip_hash text default null
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_account_hash !~ '^[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid login throttle subject';
  end if;

  delete from private.auth_login_throttle
  where last_failed_at < v_now - interval '24 hours';

  perform private.auth_login_throttle_record_one('account', p_account_hash, v_now);
  if p_ip_hash is not null then
    perform private.auth_login_throttle_record_one('ip', p_ip_hash, v_now);
  end if;

  return query
  select * from public.auth_login_throttle_check(p_account_hash, p_ip_hash);
end;
$$;

create or replace function public.auth_login_throttle_clear(
  p_account_hash text,
  p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_account_hash !~ '^[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid login throttle subject';
  end if;

  delete from private.auth_login_throttle
  where (scope = 'account' and subject_hash = p_account_hash)
     or (p_ip_hash is not null and scope = 'ip' and subject_hash = p_ip_hash);
end;
$$;

revoke all on function private.auth_login_throttle_delay_seconds(integer) from public;
revoke all on function private.auth_login_throttle_record_one(text, text, timestamptz) from public;
revoke all on function public.auth_login_throttle_check(text, text) from public, anon, authenticated;
revoke all on function public.auth_login_throttle_fail(text, text) from public, anon, authenticated;
revoke all on function public.auth_login_throttle_clear(text, text) from public, anon, authenticated;

grant execute on function public.auth_login_throttle_check(text, text) to service_role;
grant execute on function public.auth_login_throttle_fail(text, text) to service_role;
grant execute on function public.auth_login_throttle_clear(text, text) to service_role;
