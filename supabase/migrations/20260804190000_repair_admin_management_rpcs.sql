begin;

-- Repair the service-only RPC surface used by the Next.js administrator API.
-- Every mutation is one PostgreSQL transaction. Account access mutations also
-- update auth.users in that same transaction so Auth and public state cannot
-- diverge when a database statement fails.

create or replace function public.admin_refresh_profile_license(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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
    and activation.expires_at > pg_catalog.now()
    and license.status not in ('disabled', 'expired', 'revoked')
    and (license.expires_at is null or license.expires_at > pg_catalog.now())
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
security definer
set search_path = public
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
  if p_plan is not null and (pg_catalog.length(pg_catalog.btrim(p_plan)) < 1 or pg_catalog.length(p_plan) > 80) then
    raise exception using errcode = '22023', message = 'INVALID_PLAN';
  end if;
  if p_duration_days is not null and (p_duration_days < 1 or p_duration_days > 3650) then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;
  if p_max_activations is not null and (p_max_activations < 1 or p_max_activations > 100) then
    raise exception using errcode = '22023', message = 'INVALID_MAX_ACTIVATIONS';
  end if;
  if p_set_note and p_note is not null and pg_catalog.length(p_note) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_NOTE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_management_mutations'));

  if not exists (
    select 1 from public.license_codes where id = p_license_id
  ) then
    raise exception using errcode = 'P0002', message = 'LICENSE_NOT_FOUND';
  end if;

  -- Match activate_license_code's lock order (activations, then license) so an
  -- administrator edit cannot deadlock a concurrent activation.
  perform 1
  from public.license_activations
  where license_id = p_license_id
  order by id
  for update;

  select *
  into v_license
  from public.license_codes
  where id = p_license_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'LICENSE_NOT_FOUND';
  end if;

  select pg_catalog.count(*)::integer
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
        revoked_at = pg_catalog.now(),
        revoked_reason = 'LICENSE_REVOKED'
    where license_id = p_license_id
      and status in ('active', 'suspended');
  elsif p_status in ('active', 'unused') then
    update public.license_activations as activation
    set status = 'active',
        revoked_at = null,
        revoked_reason = null
    where activation.license_id = p_license_id
      and activation.status = 'suspended'
      and activation.revoked_reason in ('LICENSE_DISABLED', 'ACCOUNT_DISABLED')
      and activation.expires_at > pg_catalog.now()
      and (
        (case when p_set_expires_at then p_expires_at else v_license.expires_at end) is null
        or (case when p_set_expires_at then p_expires_at else v_license.expires_at end) > pg_catalog.now()
      )
      and exists (
        select 1
        from auth.users as auth_user
        where auth_user.id = activation.user_id
          and auth_user.deleted_at is null
          and (auth_user.banned_until is null or auth_user.banned_until <= pg_catalog.now())
      );
  end if;

  v_final_status := coalesce(p_status, v_license.status);
  if v_final_status not in ('disabled', 'revoked') then
    if p_set_expires_at and p_expires_at is not null and p_expires_at <= pg_catalog.now() then
      v_final_status := 'expired';
    elsif not p_set_expires_at and v_license.expires_at is not null and v_license.expires_at <= pg_catalog.now() then
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
      plan = coalesce(nullif(pg_catalog.btrim(p_plan), ''), plan),
      duration_days = coalesce(p_duration_days, duration_days),
      max_activations = coalesce(p_max_activations, max_activations),
      expires_at = case when p_set_expires_at then p_expires_at else expires_at end,
      note = case when p_set_note then nullif(pg_catalog.btrim(p_note), '') else note end,
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

  return pg_catalog.to_jsonb(v_license);
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
security definer
set search_path = public
as $$
declare
  v_binding public.license_activations%rowtype;
  v_license public.license_codes%rowtype;
  v_activation_count integer;
  v_base timestamptz;
  v_status text;
  v_account_deleted_at timestamptz;
  v_account_banned_until timestamptz;
begin
  if p_action not in ('extend', 'revoke', 'rebind', 'unbind') then
    raise exception using errcode = '22023', message = 'INVALID_BINDING_ACTION';
  end if;
  if p_action = 'extend' and (p_days is null or p_days < 1 or p_days > 3650) then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;
  if p_reason is not null and pg_catalog.length(p_reason) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_REASON';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_management_mutations'));

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

  select deleted_at, banned_until
  into v_account_deleted_at, v_account_banned_until
  from auth.users
  where id = v_binding.user_id
  for update;
  if not found or v_account_deleted_at is not null or v_binding.revoked_reason = 'ACCOUNT_DELETED' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETED';
  end if;
  if p_action in ('extend', 'rebind')
    and (
      (v_account_banned_until is not null and v_account_banned_until > pg_catalog.now())
      or v_binding.revoked_reason = 'ACCOUNT_DISABLED'
    )
  then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DISABLED';
  end if;

  update public.license_activations
  set status = 'expired'
  where user_id = v_binding.user_id
    and status = 'active'
    and expires_at <= pg_catalog.now();

  if p_action in ('extend', 'rebind')
    and (
      v_license.status in ('disabled', 'expired', 'revoked')
      or (v_license.expires_at is not null and v_license.expires_at <= pg_catalog.now())
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
        and expires_at > pg_catalog.now()
    ) then
      raise exception using errcode = 'P0001', message = 'USER_ALREADY_ACTIVE';
    end if;

    v_base := greatest(v_binding.expires_at, pg_catalog.now());
    update public.license_activations
    set expires_at = v_base + pg_catalog.make_interval(days => p_days),
        status = 'active',
        revoked_at = null,
        revoked_reason = null
    where id = p_binding_id;
  elsif p_action = 'revoke' then
    update public.license_activations
    set status = 'revoked',
        revoked_at = pg_catalog.now(),
        revoked_reason = coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'ADMIN_REVOKED')
    where id = p_binding_id;
  elsif p_action = 'unbind' then
    update public.license_activations
    set status = 'revoked',
        revoked_at = pg_catalog.now(),
        revoked_reason = 'EMAIL_UNBOUND'
    where id = p_binding_id;
  else
    if exists (
      select 1
      from public.license_activations
      where user_id = v_binding.user_id
        and id <> p_binding_id
        and status = 'active'
        and expires_at > pg_catalog.now()
    ) then
      raise exception using errcode = 'P0001', message = 'USER_ALREADY_ACTIVE';
    end if;

    select pg_catalog.count(*)::integer
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
    set activated_at = pg_catalog.now(),
        expires_at = pg_catalog.now() + pg_catalog.make_interval(days => v_license.duration_days),
        status = 'active',
        revoked_at = null,
        revoked_reason = null
    where id = p_binding_id;
  end if;

  select pg_catalog.count(*)::integer
  into v_activation_count
  from public.license_activations
  where license_id = v_binding.license_id
    and coalesce(revoked_reason, '') not in ('EMAIL_UNBOUND', 'ACCOUNT_DELETED');

  v_status := v_license.status;
  if v_status not in ('disabled', 'revoked') then
    if v_license.expires_at is not null and v_license.expires_at <= pg_catalog.now() then
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
  return pg_catalog.to_jsonb(v_binding);
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'USER_ALREADY_ACTIVE';
end;
$$;

create or replace function public.admin_set_user_role(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
  v_admin_count integer;
  v_target_deleted_at timestamptz;
  v_target_banned_until timestamptz;
begin
  if p_role not in ('user', 'admin') then
    raise exception using errcode = '22023', message = 'INVALID_USER_ROLE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_management_mutations'));

  if not exists (
    select 1
    from public.profiles as actor_profile
    join auth.users as actor_user on actor_user.id = actor_profile.id
    where actor_profile.id = p_actor_user_id
      and actor_profile.role = 'admin'
      and actor_user.deleted_at is null
      and (actor_user.banned_until is null or actor_user.banned_until <= pg_catalog.now())
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

  select deleted_at, banned_until
  into v_target_deleted_at, v_target_banned_until
  from auth.users
  where id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;
  if v_target_deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETED';
  end if;
  if p_role = 'admin'
    and v_target_banned_until is not null
    and v_target_banned_until > pg_catalog.now()
  then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DISABLED';
  end if;

  if p_actor_user_id = p_user_id and p_role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'CANNOT_CHANGE_SELF';
  end if;

  if v_current_role = 'admin' and p_role = 'user' then
    select pg_catalog.count(*)::integer
    into v_admin_count
    from public.profiles as admin_profile
    join auth.users as admin_user on admin_user.id = admin_profile.id
    where admin_profile.role = 'admin'
      and admin_user.deleted_at is null
      and (admin_user.banned_until is null or admin_user.banned_until <= pg_catalog.now());

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
security definer
set search_path = public
as $$
declare
  v_deleted_at timestamptz;
  v_role text;
begin
  if p_action not in ('disable', 'enable') then
    raise exception using errcode = '22023', message = 'INVALID_USER_ACCESS_ACTION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_management_mutations'));

  select deleted_at
  into v_deleted_at
  from auth.users
  where id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;
  if v_deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETED';
  end if;

  select role
  into v_role
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;
  if p_action = 'disable' and v_role = 'admin' then
    raise exception using errcode = 'P0001', message = 'ADMIN_ROLE_PROTECTED';
  end if;

  update auth.users
  set banned_until = case
        when p_action = 'disable' then pg_catalog.now() + interval '100 years'
        else null
      end,
      updated_at = pg_catalog.now()
  where id = p_user_id;

  if p_action = 'disable' then
    update public.license_activations
    set status = 'suspended',
        revoked_at = null,
        revoked_reason = 'ACCOUNT_DISABLED'
    where user_id = p_user_id
      and status = 'active';
  else
    update public.license_activations as activation
    set status = 'active',
        revoked_at = null,
        revoked_reason = null
    where activation.user_id = p_user_id
      and activation.status = 'suspended'
      and activation.revoked_reason in ('ACCOUNT_DISABLED', 'LICENSE_DISABLED')
      and activation.expires_at > pg_catalog.now()
      and exists (
        select 1
        from public.license_codes as license
        where license.id = activation.license_id
          and license.status not in ('disabled', 'expired', 'revoked')
          and (license.expires_at is null or license.expires_at > pg_catalog.now())
      );
  end if;

  perform public.admin_refresh_profile_license(p_user_id);
end;
$$;

create or replace function public.admin_prepare_user_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_license_id uuid;
  v_activation_count integer;
  v_license public.license_codes%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_management_mutations'));

  perform 1
  from auth.users
  where id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;

  select role
  into v_role
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;
  if v_role = 'admin' then
    raise exception using errcode = 'P0001', message = 'ADMIN_ROLE_PROTECTED';
  end if;

  -- Banning and public-state preparation are atomic. If the subsequent GoTrue
  -- soft-delete request fails, the account remains consistently inaccessible
  -- on both sides and can be retried without deleting business data.
  update auth.users
  set banned_until = pg_catalog.now() + interval '100 years',
      updated_at = pg_catalog.now()
  where id = p_user_id;

  update public.license_activations
  set status = 'revoked',
      revoked_at = pg_catalog.now(),
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
    order by license_id
  loop
    select *
    into v_license
    from public.license_codes
    where id = v_license_id
    for update;

    if found then
      select pg_catalog.count(*)::integer
      into v_activation_count
      from public.license_activations
      where license_id = v_license_id
        and coalesce(revoked_reason, '') not in ('EMAIL_UNBOUND', 'ACCOUNT_DELETED');

      update public.license_codes
      set activation_count = v_activation_count,
          status = case
            when v_license.status in ('disabled', 'revoked') then v_license.status
            when v_license.expires_at is not null and v_license.expires_at <= pg_catalog.now() then 'expired'
            when v_activation_count = 0 then 'unused'
            when v_activation_count >= v_license.max_activations then 'exhausted'
            else 'active'
          end
      where id = v_license_id;
    end if;
  end loop;
end;
$$;

create or replace function public.get_web_license_access_state(p_user_id uuid)
returns table (
  profile_id uuid,
  profile_email text,
  profile_phone text,
  profile_role text,
  profile_license_status text,
  profile_license_expires_at timestamptz,
  profile_display_name text,
  profile_manual_average_score numeric,
  activation_id uuid,
  activation_license_id uuid,
  activation_email text,
  activation_activated_at timestamptz,
  activation_expires_at timestamptz,
  activation_status text,
  activation_last_used_at timestamptz,
  license_id uuid,
  license_plan text,
  license_status text,
  license_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.email,
    profile.phone,
    profile.role,
    profile.license_status,
    profile.license_expires_at,
    profile.display_name,
    profile.manual_average_score,
    access.activation_id,
    access.activation_license_id,
    access.activation_email,
    access.activation_activated_at,
    access.activation_expires_at,
    access.activation_status,
    access.activation_last_used_at,
    access.license_id,
    access.license_plan,
    access.license_status,
    access.license_expires_at
  from public.profiles as profile
  left join lateral (
    select
      activation.id as activation_id,
      activation.license_id as activation_license_id,
      activation.email as activation_email,
      activation.activated_at as activation_activated_at,
      activation.expires_at as activation_expires_at,
      activation.status as activation_status,
      activation.last_used_at as activation_last_used_at,
      license.id as license_id,
      license.plan as license_plan,
      license.status as license_status,
      license.expires_at as license_expires_at
    from public.license_activations as activation
    join public.license_codes as license on license.id = activation.license_id
    where activation.user_id = p_user_id
      and activation.status = 'active'
      and activation.expires_at > pg_catalog.now()
    order by activation.expires_at desc
    limit 1
  ) as access on true
  where profile.id = p_user_id;
$$;

revoke all on function public.admin_refresh_profile_license(uuid) from public, anon, authenticated;
revoke all on function public.admin_mutate_license(uuid, text, text, integer, integer, timestamptz, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_mutate_binding(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_user_access(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_prepare_user_deletion(uuid) from public, anon, authenticated;
revoke all on function public.get_web_license_access_state(uuid) from public, anon, authenticated;

grant execute on function public.admin_refresh_profile_license(uuid) to service_role;
grant execute on function public.admin_mutate_license(uuid, text, text, integer, integer, timestamptz, boolean, text, boolean) to service_role;
grant execute on function public.admin_mutate_binding(uuid, text, integer, text) to service_role;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to service_role;
grant execute on function public.admin_set_user_access(uuid, text) to service_role;
grant execute on function public.admin_prepare_user_deletion(uuid) to service_role;
grant execute on function public.get_web_license_access_state(uuid) to service_role;

commit;
