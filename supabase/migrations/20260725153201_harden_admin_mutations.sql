-- Keep administrator mutations transactional and preserve an auditable history.
-- These functions are SECURITY INVOKER and executable only by service_role.

alter function public.log_admin_action(uuid, text, text, text, text, text, jsonb, text, text, text, jsonb)
  security invoker;
alter function public.get_admin_overview_stats()
  security invoker;
alter function public.get_admin_recent_records()
  security invoker;

create or replace function public.admin_refresh_profile_license(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_active_expires_at timestamptz;
  v_has_suspension boolean;
begin
  select activation.expires_at
  into v_active_expires_at
  from public.license_activations as activation
  join public.license_codes as license on license.id = activation.license_id
  where activation.user_id = p_user_id
    and activation.status = 'active'
    and activation.expires_at > now()
    and license.status not in ('disabled', 'expired', 'revoked')
    and (license.expires_at is null or license.expires_at > now())
  order by activation.expires_at desc
  limit 1;

  if v_active_expires_at is not null then
    update public.profiles
    set license_status = 'active',
        license_expires_at = v_active_expires_at
    where id = p_user_id;
    return;
  end if;

  select exists (
    select 1
    from public.license_activations
    where user_id = p_user_id
      and status = 'suspended'
  )
  into v_has_suspension;

  update public.profiles
  set license_status = case when v_has_suspension then 'suspended' else 'inactive' end,
      license_expires_at = null
  where id = p_user_id;
end;
$$;

create or replace function public.admin_mutate_license(
  p_license_id uuid,
  p_status text default null,
  p_plan text default null,
  p_duration_days integer default null,
  p_max_activations integer default null,
  p_expires_at timestamptz default null,
  p_set_expires_at boolean default false,
  p_note text default null,
  p_set_note boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_license public.license_codes%rowtype;
  v_activation_count integer;
  v_final_status text;
  v_user_id uuid;
begin
  if p_status is not null and p_status not in ('unused', 'active', 'disabled', 'revoked') then
    raise exception using errcode = '22023', message = 'INVALID_LICENSE_STATUS';
  end if;
  if p_duration_days is not null and (p_duration_days < 1 or p_duration_days > 3650) then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;
  if p_max_activations is not null and (p_max_activations < 1 or p_max_activations > 100) then
    raise exception using errcode = '22023', message = 'INVALID_MAX_ACTIVATIONS';
  end if;

  select *
  into v_license
  from public.license_codes
  where id = p_license_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'LICENSE_NOT_FOUND';
  end if;

  select count(*)::integer
  into v_activation_count
  from public.license_activations
  where license_id = p_license_id
    and coalesce(revoked_reason, '') not in ('EMAIL_UNBOUND', 'ACCOUNT_DELETED');

  if v_license.status = 'revoked' and coalesce(p_status, 'revoked') <> 'revoked' then
    raise exception using errcode = 'P0001', message = 'LICENSE_REVOKED';
  end if;
  if p_max_activations is not null and p_max_activations < v_activation_count then
    raise exception using errcode = 'P0001', message = 'MAX_ACTIVATIONS_BELOW_USAGE';
  end if;

  if p_status = 'disabled' then
    update public.license_activations
    set status = 'suspended',
        revoked_at = null,
        revoked_reason = 'LICENSE_DISABLED'
    where license_id = p_license_id
      and status = 'active';
  elsif p_status = 'revoked' then
    update public.license_activations
    set status = 'revoked',
        revoked_at = now(),
        revoked_reason = 'LICENSE_REVOKED'
    where license_id = p_license_id
      and status in ('active', 'suspended');
  elsif p_status in ('active', 'unused') then
    update public.license_activations
    set status = 'active',
        revoked_at = null,
        revoked_reason = null
    where license_id = p_license_id
      and status = 'suspended'
      and revoked_reason = 'LICENSE_DISABLED'
      and expires_at > now()
      and (
        (case when p_set_expires_at then p_expires_at else v_license.expires_at end) is null
        or (case when p_set_expires_at then p_expires_at else v_license.expires_at end) > now()
      );
  end if;

  v_final_status := coalesce(p_status, v_license.status);
  if v_final_status not in ('disabled', 'revoked') then
    if p_set_expires_at and p_expires_at is not null and p_expires_at <= now() then
      v_final_status := 'expired';
    elsif not p_set_expires_at and v_license.expires_at is not null and v_license.expires_at <= now() then
      v_final_status := 'expired';
    elsif v_activation_count = 0 then
      v_final_status := 'unused';
    elsif v_activation_count >= coalesce(p_max_activations, v_license.max_activations) then
      v_final_status := 'exhausted';
    else
      v_final_status := 'active';
    end if;
  end if;

  update public.license_codes
  set status = v_final_status,
      plan = coalesce(p_plan, plan),
      duration_days = coalesce(p_duration_days, duration_days),
      max_activations = coalesce(p_max_activations, max_activations),
      expires_at = case when p_set_expires_at then p_expires_at else expires_at end,
      note = case when p_set_note then nullif(btrim(p_note), '') else note end,
      activation_count = v_activation_count
  where id = p_license_id
  returning * into v_license;

  for v_user_id in
    select distinct user_id
    from public.license_activations
    where license_id = p_license_id
  loop
    perform public.admin_refresh_profile_license(v_user_id);
  end loop;

  return to_jsonb(v_license);
end;
$$;

create or replace function public.admin_mutate_binding(
  p_binding_id uuid,
  p_action text,
  p_days integer default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_binding public.license_activations%rowtype;
  v_license public.license_codes%rowtype;
  v_activation_count integer;
  v_base timestamptz;
  v_status text;
begin
  if p_action not in ('extend', 'revoke', 'rebind', 'unbind') then
    raise exception using errcode = '22023', message = 'INVALID_BINDING_ACTION';
  end if;
  if p_action = 'extend' and (p_days is null or p_days < 1 or p_days > 3650) then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;

  select *
  into v_binding
  from public.license_activations
  where id = p_binding_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'BINDING_NOT_FOUND';
  end if;

  select *
  into v_license
  from public.license_codes
  where id = v_binding.license_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'LICENSE_NOT_FOUND';
  end if;

  if v_binding.revoked_reason = 'ACCOUNT_DELETED' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETED';
  end if;
  if p_action in ('extend', 'rebind') and v_binding.revoked_reason = 'ACCOUNT_DISABLED' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DISABLED';
  end if;

  update public.license_activations
  set status = 'expired'
  where user_id = v_binding.user_id
    and status = 'active'
    and expires_at <= now();

  if p_action in ('extend', 'rebind')
    and (
      v_license.status in ('disabled', 'expired', 'revoked')
      or (v_license.expires_at is not null and v_license.expires_at <= now())
    )
  then
    raise exception using errcode = 'P0001', message = 'LICENSE_UNAVAILABLE';
  end if;

  if p_action = 'extend' then
    if v_binding.revoked_reason = 'EMAIL_UNBOUND' then
      raise exception using errcode = 'P0001', message = 'BINDING_UNBOUND';
    end if;
    if exists (
      select 1
      from public.license_activations
      where user_id = v_binding.user_id
        and id <> p_binding_id
        and status = 'active'
        and expires_at > now()
    ) then
      raise exception using errcode = 'P0001', message = 'USER_ALREADY_ACTIVE';
    end if;

    v_base := greatest(v_binding.expires_at, now());
    update public.license_activations
    set expires_at = v_base + make_interval(days => p_days),
        status = 'active',
        revoked_at = null,
        revoked_reason = null
    where id = p_binding_id;
  elsif p_action = 'revoke' then
    update public.license_activations
    set status = 'revoked',
        revoked_at = now(),
        revoked_reason = coalesce(nullif(btrim(p_reason), ''), 'ADMIN_REVOKED')
    where id = p_binding_id;
  elsif p_action = 'unbind' then
    update public.license_activations
    set status = 'revoked',
        revoked_at = now(),
        revoked_reason = 'EMAIL_UNBOUND'
    where id = p_binding_id;
  else
    if exists (
      select 1
      from public.license_activations
      where user_id = v_binding.user_id
        and id <> p_binding_id
        and status = 'active'
        and expires_at > now()
    ) then
      raise exception using errcode = 'P0001', message = 'USER_ALREADY_ACTIVE';
    end if;

    select count(*)::integer
    into v_activation_count
    from public.license_activations
    where license_id = v_binding.license_id
      and coalesce(revoked_reason, '') not in ('EMAIL_UNBOUND', 'ACCOUNT_DELETED');

    if v_binding.revoked_reason = 'EMAIL_UNBOUND'
      and v_activation_count >= v_license.max_activations
    then
      raise exception using errcode = 'P0001', message = 'LICENSE_EXHAUSTED';
    end if;

    update public.license_activations
    set activated_at = now(),
        expires_at = now() + make_interval(days => v_license.duration_days),
        status = 'active',
        revoked_at = null,
        revoked_reason = null
    where id = p_binding_id;
  end if;

  select count(*)::integer
  into v_activation_count
  from public.license_activations
  where license_id = v_binding.license_id
    and coalesce(revoked_reason, '') not in ('EMAIL_UNBOUND', 'ACCOUNT_DELETED');

  v_status := v_license.status;
  if v_status not in ('disabled', 'revoked') then
    if v_license.expires_at is not null and v_license.expires_at <= now() then
      v_status := 'expired';
    elsif v_activation_count = 0 then
      v_status := 'unused';
    elsif v_activation_count >= v_license.max_activations then
      v_status := 'exhausted';
    else
      v_status := 'active';
    end if;
  end if;

  update public.license_codes
  set activation_count = v_activation_count,
      status = v_status
  where id = v_binding.license_id;

  perform public.admin_refresh_profile_license(v_binding.user_id);

  select *
  into v_binding
  from public.license_activations
  where id = p_binding_id;
  return to_jsonb(v_binding);
end;
$$;

create or replace function public.get_admin_usage_summary(p_user_ids uuid[])
returns table (
  user_id uuid,
  evaluation_count bigint,
  last_used_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select usage.user_id, count(*)::bigint, max(usage.created_at)
  from public.usage_records as usage
  where usage.user_id = any(p_user_ids)
  group by usage.user_id;
$$;

create or replace function public.admin_set_user_role(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_role text;
  v_admin_count integer;
begin
  if p_role not in ('user', 'admin') then
    raise exception using errcode = '22023', message = 'INVALID_USER_ROLE';
  end if;

  -- Serialize every role change. Locking only the target row is insufficient:
  -- two administrators could otherwise demote one another at the same time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_user_role_changes'));

  if not exists (
    select 1
    from public.profiles
    where id = p_actor_user_id
      and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'ACTOR_NOT_ADMIN';
  end if;

  select role
  into v_current_role
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;

  if p_actor_user_id = p_user_id and p_role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'CANNOT_CHANGE_SELF';
  end if;

  if v_current_role = 'admin' and p_role = 'user' then
    select count(*)::integer
    into v_admin_count
    from public.profiles
    where role = 'admin';

    if v_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'LAST_ADMIN_PROTECTED';
    end if;
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id;
end;
$$;

create or replace function public.admin_set_user_access(
  p_user_id uuid,
  p_action text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_action = 'disable' then
    update public.license_activations
    set status = 'suspended',
        revoked_at = null,
        revoked_reason = 'ACCOUNT_DISABLED'
    where user_id = p_user_id
      and status = 'active';
  elsif p_action = 'enable' then
    update public.license_activations as activation
    set status = 'active',
        revoked_at = null,
        revoked_reason = null
    where activation.user_id = p_user_id
      and activation.status = 'suspended'
      and activation.revoked_reason = 'ACCOUNT_DISABLED'
      and activation.expires_at > now()
      and exists (
        select 1
        from public.license_codes as license
        where license.id = activation.license_id
          and license.status not in ('disabled', 'expired', 'revoked')
          and (license.expires_at is null or license.expires_at > now())
      );
  else
    raise exception using errcode = '22023', message = 'INVALID_USER_ACCESS_ACTION';
  end if;

  perform public.admin_refresh_profile_license(p_user_id);
end;
$$;

create or replace function public.admin_prepare_user_deletion(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_license_id uuid;
  v_activation_count integer;
  v_license public.license_codes%rowtype;
begin
  update public.license_activations
  set status = 'revoked',
      revoked_at = now(),
      revoked_reason = 'ACCOUNT_DELETED'
  where user_id = p_user_id
    and status in ('active', 'suspended', 'expired')
    and revoked_reason is distinct from 'EMAIL_UNBOUND';

  update public.profiles
  set license_status = 'suspended',
      license_expires_at = null
  where id = p_user_id;

  for v_license_id in
    select distinct license_id
    from public.license_activations
    where user_id = p_user_id
  loop
    select *
    into v_license
    from public.license_codes
    where id = v_license_id
    for update;

    if found then
      select count(*)::integer
      into v_activation_count
      from public.license_activations
      where license_id = v_license_id
        and coalesce(revoked_reason, '') not in ('EMAIL_UNBOUND', 'ACCOUNT_DELETED');

      update public.license_codes
      set activation_count = v_activation_count,
          status = case
            when v_license.status in ('disabled', 'revoked') then v_license.status
            when v_license.expires_at is not null and v_license.expires_at <= now() then 'expired'
            when v_activation_count = 0 then 'unused'
            when v_activation_count >= v_license.max_activations then 'exhausted'
            else 'active'
          end
      where id = v_license_id;
    end if;
  end loop;
end;
$$;

-- Reconcile counters once so list endpoints can use the indexed stored value.
with counts as (
  select
    license.id,
    count(activation.id) filter (
      where coalesce(activation.revoked_reason, '') not in ('EMAIL_UNBOUND', 'ACCOUNT_DELETED')
    )::integer as activation_count
  from public.license_codes as license
  left join public.license_activations as activation on activation.license_id = license.id
  group by license.id
)
update public.license_codes as license
set activation_count = counts.activation_count,
    status = case
      when license.status in ('disabled', 'revoked') then license.status
      when license.expires_at is not null and license.expires_at <= now() then 'expired'
      when counts.activation_count = 0 then 'unused'
      when counts.activation_count >= license.max_activations then 'exhausted'
      else 'active'
    end
from counts
where counts.id = license.id;

revoke all on function public.admin_refresh_profile_license(uuid) from public, anon, authenticated;
revoke all on function public.admin_mutate_license(uuid, text, text, integer, integer, timestamptz, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_mutate_binding(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.get_admin_usage_summary(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_user_access(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_prepare_user_deletion(uuid) from public, anon, authenticated;

grant execute on function public.admin_refresh_profile_license(uuid) to service_role;
grant execute on function public.admin_mutate_license(uuid, text, text, integer, integer, timestamptz, boolean, text, boolean) to service_role;
grant execute on function public.admin_mutate_binding(uuid, text, integer, text) to service_role;
grant execute on function public.get_admin_usage_summary(uuid[]) to service_role;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to service_role;
grant execute on function public.admin_set_user_access(uuid, text) to service_role;
grant execute on function public.admin_prepare_user_deletion(uuid) to service_role;
