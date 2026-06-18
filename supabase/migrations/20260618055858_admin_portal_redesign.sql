alter table public.license_codes
  add column if not exists code_value text,
  add column if not exists note text;

alter table public.license_codes
  drop constraint if exists license_codes_status_check;

alter table public.license_codes
  add constraint license_codes_status_check
  check (status in ('unused', 'active', 'exhausted', 'disabled', 'expired', 'revoked'));

update public.admin_settings
set value = value || jsonb_build_object(
  'defaultMaxActivations',
  coalesce((value ->> 'defaultMaxActivations')::integer, (value ->> 'defaultMaxDevices')::integer, 1),
  'defaultPlan',
  coalesce(value ->> 'defaultPlan', 'standard')
)
where id = 'default';

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
set search_path = public
as $$
declare
  v_license public.license_codes%rowtype;
  v_existing public.license_activations%rowtype;
  v_now timestamptz := now();
  v_expires_at timestamptz;
  v_next_count integer;
begin
  update public.license_activations
  set status = 'expired'
  where user_id = p_user_id
    and status = 'active'
    and expires_at <= v_now;

  update public.profiles
  set license_status = 'expired',
      license_expires_at = null
  where id = p_user_id
    and license_status = 'active'
    and license_expires_at <= v_now;

  select *
  into v_existing
  from public.license_activations
  where user_id = p_user_id
    and status = 'active'
    and expires_at > v_now
  limit 1;

  if found then
    return query select false, 'USER_ALREADY_ACTIVE', '当前账号已有有效激活记录', v_existing.expires_at, null::text, v_existing.license_id;
    return;
  end if;

  select *
  into v_license
  from public.license_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    return query select false, 'LICENSE_INVALID', '激活码无效', null::timestamptz, null::text, null::uuid;
    return;
  end if;

  if v_license.status = 'disabled' then
    return query select false, 'LICENSE_DISABLED', '激活码已禁用', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.status = 'revoked' then
    return query select false, 'LICENSE_REVOKED', '激活码已撤销', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.status = 'expired' or (v_license.expires_at is not null and v_license.expires_at <= v_now) then
    update public.license_codes
    set status = 'expired'
    where id = v_license.id;
    return query select false, 'LICENSE_EXPIRED', '激活码已过期', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.max_activations = 1
    and exists (
      select 1
      from public.license_activations
      where license_id = v_license.id
        and lower(email) <> lower(p_email)
    )
  then
    return query select false, 'LICENSE_ALREADY_USED', '激活码已绑定其他邮箱', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.activation_count >= v_license.max_activations or v_license.status = 'exhausted' then
    update public.license_codes
    set status = 'exhausted'
    where id = v_license.id;
    return query select false, 'LICENSE_EXHAUSTED', '激活码可用次数已用完', null::timestamptz, v_license.plan, v_license.id;
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

  update public.license_codes
  set activation_count = v_next_count,
      status = case when v_next_count >= v_license.max_activations then 'exhausted' else 'active' end
  where id = v_license.id;

  insert into public.profiles (id, email, license_status, license_expires_at)
  values (p_user_id, p_email, 'active', v_expires_at)
  on conflict (id) do update
    set email = excluded.email,
        license_status = 'active',
        license_expires_at = excluded.license_expires_at,
        updated_at = now();

  return query select true, null::text, '激活成功', v_expires_at, v_license.plan, v_license.id;
exception
  when unique_violation then
    return query select false, 'USER_ALREADY_ACTIVE', '当前账号已有有效激活记录', null::timestamptz, null::text, null::uuid;
  when others then
    return query select false, 'INTERNAL_ERROR', '激活失败，请稍后重试', null::timestamptz, null::text, null::uuid;
end;
$$;

grant execute on function public.activate_license_code(text, uuid, text) to service_role;
