create table if not exists public.password_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  email_hash text not null check (length(email_hash) = 64),
  ip_hash text check (ip_hash is null or length(ip_hash) = 64),
  purpose text not null default 'password_recovery' check (purpose = 'password_recovery'),
  status text not null default 'accepted' check (status in ('accepted', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_password_recovery_requests_email_created
  on public.password_recovery_requests(email_hash, created_at desc);

create index if not exists idx_password_recovery_requests_ip_created
  on public.password_recovery_requests(ip_hash, created_at desc)
  where ip_hash is not null;

create index if not exists idx_password_recovery_requests_purpose_created
  on public.password_recovery_requests(purpose, created_at desc);

create index if not exists idx_password_recovery_requests_created
  on public.password_recovery_requests(created_at);

alter table public.password_recovery_requests enable row level security;

revoke all on public.password_recovery_requests from public, anon, authenticated;
grant select, insert, update, delete on public.password_recovery_requests to service_role;

create or replace function public.check_password_recovery_rate_limit(
  p_email_hash text,
  p_ip_hash text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_oldest timestamptz;
  v_retry_after integer;
begin
  if p_email_hash is null or length(p_email_hash) <> 64 or p_request_id is null then
    raise exception 'invalid password recovery rate-limit input';
  end if;

  if p_ip_hash is not null and length(p_ip_hash) <> 64 then
    raise exception 'invalid password recovery IP hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('password-recovery-email:' || p_email_hash, 0));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('password-recovery-ip:' || p_ip_hash, 0));
  end if;

  delete from public.password_recovery_requests
  where created_at < v_now - interval '7 days';

  select created_at
    into v_oldest
  from public.password_recovery_requests
  where email_hash = p_email_hash
    and purpose = 'password_recovery'
    and created_at > v_now - interval '60 seconds'
  order by created_at desc
  limit 1;

  if v_oldest is not null then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_oldest + interval '60 seconds' - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'retry_after', v_retry_after, 'reason', 'email_cooldown');
  end if;

  select count(*), min(created_at)
    into v_count, v_oldest
  from public.password_recovery_requests
  where email_hash = p_email_hash
    and purpose = 'password_recovery'
    and created_at > v_now - interval '1 hour';

  if v_count >= 5 then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'retry_after', v_retry_after, 'reason', 'email_hour');
  end if;

  select count(*), min(created_at)
    into v_count, v_oldest
  from public.password_recovery_requests
  where email_hash = p_email_hash
    and purpose = 'password_recovery'
    and created_at > v_now - interval '1 day';

  if v_count >= 12 then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_oldest + interval '1 day' - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'retry_after', v_retry_after, 'reason', 'email_day');
  end if;

  if p_ip_hash is not null then
    select count(*), min(created_at)
      into v_count, v_oldest
    from public.password_recovery_requests
    where ip_hash = p_ip_hash
      and purpose = 'password_recovery'
      and created_at > v_now - interval '10 minutes';

    if v_count >= 5 then
      v_retry_after := greatest(1, ceil(extract(epoch from (v_oldest + interval '10 minutes' - v_now)))::integer);
      return jsonb_build_object('allowed', false, 'retry_after', v_retry_after, 'reason', 'ip_burst');
    end if;

    select count(*), min(created_at)
      into v_count, v_oldest
    from public.password_recovery_requests
    where ip_hash = p_ip_hash
      and purpose = 'password_recovery'
      and created_at > v_now - interval '1 hour';

    if v_count >= 10 then
      v_retry_after := greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - v_now)))::integer);
      return jsonb_build_object('allowed', false, 'retry_after', v_retry_after, 'reason', 'ip_hour');
    end if;
  end if;

  insert into public.password_recovery_requests (
    request_id,
    email_hash,
    ip_hash,
    purpose,
    status,
    created_at
  ) values (
    p_request_id,
    p_email_hash,
    p_ip_hash,
    'password_recovery',
    'accepted',
    v_now
  );

  return jsonb_build_object('allowed', true, 'retry_after', 0, 'reason', 'accepted');
end;
$$;

revoke all on function public.check_password_recovery_rate_limit(text, text, uuid) from public, anon, authenticated;
grant execute on function public.check_password_recovery_rate_limit(text, text, uuid) to service_role;

comment on table public.password_recovery_requests is
  'Service-role-only password recovery send limits. Stores hashes and metadata only; never OTPs, passwords, or sessions.';
