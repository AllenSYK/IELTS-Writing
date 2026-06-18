-- Normalize every CHECK constraint that references license_codes.status.
-- This intentionally discovers constraints by catalog dependency rather than
-- assuming a historical constraint name.
do $$
declare
  v_constraint record;
  v_status_attnum smallint;
begin
  if exists (
    select 1
    from public.license_codes as license
    where license.status not in (
      'unused',
      'active',
      'exhausted',
      'disabled',
      'expired',
      'revoked'
    )
  ) then
    raise exception 'license_codes contains unsupported status values; refusing to replace status constraints';
  end if;

  select attribute.attnum
  into v_status_attnum
  from pg_attribute as attribute
  where attribute.attrelid = 'public.license_codes'::regclass
    and attribute.attname = 'status'
    and not attribute.attisdropped;

  for v_constraint in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.license_codes'::regclass
      and constraint_row.contype = 'c'
      and v_status_attnum = any(constraint_row.conkey)
  loop
    execute format(
      'alter table public.license_codes drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.license_codes
  add constraint license_codes_status_check
  check (
    status in (
      'unused',
      'active',
      'exhausted',
      'disabled',
      'expired',
      'revoked'
    )
  )
  not valid;

alter table public.license_codes
  validate constraint license_codes_status_check;

create or replace function public.activate_license_code(
  p_code_hash text,
  p_user_id uuid,
  p_email text
)
returns table (
  success boolean,
  error_code text,
  message text,
  expires_at timestamptz,
  plan text,
  license_id uuid
)
language plpgsql
set search_path = ''
as $$
declare
  v_license public.license_codes%rowtype;
  v_existing public.license_activations%rowtype;
  v_now timestamptz := now();
  v_expires_at timestamptz;
  v_next_count integer;
begin
  update public.license_activations as activation
  set status = 'expired'
  where activation.user_id = p_user_id
    and activation.status = 'active'
    and activation.expires_at <= v_now;

  update public.profiles as profile
  set license_status = 'expired',
      license_expires_at = null
  where profile.id = p_user_id
    and profile.license_status = 'active'
    and profile.license_expires_at <= v_now;

  select activation.*
  into v_existing
  from public.license_activations as activation
  where activation.user_id = p_user_id
    and activation.status = 'active'
    and activation.expires_at > v_now
  limit 1;

  if found then
    return query
    select
      false,
      'USER_ALREADY_ACTIVE',
      '当前账号已有有效激活记录',
      v_existing.expires_at,
      null::text,
      v_existing.license_id;
    return;
  end if;

  select license.*
  into v_license
  from public.license_codes as license
  where license.code_hash = p_code_hash
  for update;

  if not found then
    return query
    select false, 'LICENSE_INVALID', '激活码无效', null::timestamptz, null::text, null::uuid;
    return;
  end if;

  -- Recheck after taking the license row lock. This closes the concurrent
  -- double-submit race and preserves USER_ALREADY_ACTIVE for the same user.
  select activation.*
  into v_existing
  from public.license_activations as activation
  where activation.user_id = p_user_id
    and activation.status = 'active'
    and activation.expires_at > v_now
  limit 1;

  if found then
    return query
    select
      false,
      'USER_ALREADY_ACTIVE',
      '当前账号已有有效激活记录',
      v_existing.expires_at,
      null::text,
      v_existing.license_id;
    return;
  end if;

  if v_license.status = 'disabled' then
    return query
    select false, 'LICENSE_DISABLED', '激活码已禁用', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.status = 'revoked' then
    return query
    select false, 'LICENSE_REVOKED', '激活码已撤销', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.status = 'expired'
    or (v_license.expires_at is not null and v_license.expires_at <= v_now)
  then
    update public.license_codes as license
    set status = 'expired'
    where license.id = v_license.id;

    return query
    select false, 'LICENSE_EXPIRED', '激活码已过期', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.max_activations = 1
    and exists (
      select 1
      from public.license_activations as activation
      where activation.license_id = v_license.id
        and lower(activation.email) <> lower(p_email)
        and activation.revoked_reason is distinct from 'EMAIL_UNBOUND'
    )
  then
    return query
    select false, 'LICENSE_ALREADY_USED', '激活码已绑定其他邮箱', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.activation_count >= v_license.max_activations
    or v_license.status = 'exhausted'
  then
    update public.license_codes as license
    set status = 'exhausted'
    where license.id = v_license.id;

    return query
    select false, 'LICENSE_EXHAUSTED', '激活码可用次数已用完', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  v_expires_at := v_now + make_interval(days => v_license.duration_days);

  insert into public.license_activations (
    license_id,
    user_id,
    email,
    activated_at,
    expires_at,
    status
  )
  values (
    v_license.id,
    p_user_id,
    p_email,
    v_now,
    v_expires_at,
    'active'
  );

  v_next_count := v_license.activation_count + 1;

  update public.license_codes as license
  set activation_count = v_next_count,
      status = case
        when v_next_count >= v_license.max_activations then 'exhausted'
        else 'active'
      end
  where license.id = v_license.id;

  insert into public.profiles (
    id,
    email,
    license_status,
    license_expires_at
  )
  values (
    p_user_id,
    p_email,
    'active',
    v_expires_at
  )
  on conflict (id) do update
    set email = excluded.email,
        license_status = 'active',
        license_expires_at = excluded.license_expires_at,
        updated_at = now();

  return query
  select true, null::text, '激活成功', v_expires_at, v_license.plan, v_license.id;
exception
  when unique_violation then
    return query
    select false, 'USER_ALREADY_ACTIVE', '当前账号已有有效激活记录', null::timestamptz, null::text, null::uuid;
  when others then
    raise log 'activate_license_code failed: sqlstate=%, error=%, user_id=%, email=%',
      SQLSTATE,
      SQLERRM,
      p_user_id,
      p_email;

    return query
    select false, 'INTERNAL_ERROR', '激活失败，请稍后重试', null::timestamptz, null::text, null::uuid;
end;
$$;

revoke all on function public.activate_license_code(text, uuid, text)
from public, anon, authenticated;

grant execute on function public.activate_license_code(text, uuid, text)
to service_role;
