create extension if not exists pgcrypto;

create schema if not exists private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  license_status text not null default 'inactive' check (license_status in ('inactive', 'active', 'expired', 'suspended')),
  license_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_prefix text not null,
  plan text not null default 'standard',
  duration_days integer not null check (duration_days > 0),
  max_activations integer not null default 1 check (max_activations > 0),
  activation_count integer not null default 0 check (activation_count >= 0),
  status text not null default 'unused' check (status in ('unused', 'active', 'exhausted', 'disabled', 'expired')),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.license_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'suspended')),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  license_id uuid references public.license_codes(id) on delete set null,
  action text,
  model text,
  input_tokens integer,
  output_tokens integer,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.writing_records
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_license_status on public.profiles(license_status, license_expires_at);
create index if not exists idx_license_codes_prefix on public.license_codes(code_prefix);
create index if not exists idx_license_codes_status on public.license_codes(status);
create index if not exists idx_license_codes_expires_at on public.license_codes(expires_at);
create index if not exists idx_license_activations_user_status on public.license_activations(user_id, status, expires_at desc);
create index if not exists idx_license_activations_license_id on public.license_activations(license_id);
create index if not exists idx_license_activations_email on public.license_activations(email);
create unique index if not exists idx_license_activations_one_active_user
  on public.license_activations(user_id)
  where status = 'active';
create index if not exists idx_usage_records_user_created_at on public.usage_records(user_id, created_at desc);
create index if not exists idx_writing_records_user_submitted_at on public.writing_records(user_id, submitted_at desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_license_codes_updated_at on public.license_codes;
create trigger trg_license_codes_updated_at
before update on public.license_codes
for each row execute function public.set_updated_at();

create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function private.handle_new_user_profile();

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

alter table public.profiles enable row level security;
alter table public.license_codes enable row level security;
alter table public.license_activations enable row level security;
alter table public.usage_records enable row level security;
alter table public.writing_records enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own_email" on public.profiles;
create policy "profiles_update_own_email"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "license_activations_select_own" on public.license_activations;
create policy "license_activations_select_own"
on public.license_activations
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "usage_records_select_own" on public.usage_records;
create policy "usage_records_select_own"
on public.usage_records
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "writing_records_select_own" on public.writing_records;
create policy "writing_records_select_own"
on public.writing_records
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "writing_records_insert_own" on public.writing_records;
create policy "writing_records_insert_own"
on public.writing_records
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "writing_records_update_own" on public.writing_records;
create policy "writing_records_update_own"
on public.writing_records
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "writing_records_delete_own" on public.writing_records;
create policy "writing_records_delete_own"
on public.writing_records
for delete
to authenticated
using (user_id = auth.uid());

revoke all on public.profiles from anon, authenticated;
revoke all on public.license_codes from anon, authenticated;
revoke all on public.license_activations from anon, authenticated;
revoke all on public.usage_records from anon, authenticated;
revoke all on public.activate_license_code(text, uuid, text) from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (email) on public.profiles to authenticated;
grant select on public.license_activations to authenticated;
grant select on public.usage_records to authenticated;
grant select, insert, update, delete on public.writing_records to authenticated;

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.license_codes to service_role;
grant select, insert, update, delete on public.license_activations to service_role;
grant select, insert, update, delete on public.usage_records to service_role;
grant select, insert, update, delete on public.writing_records to service_role;
grant execute on function public.activate_license_code(text, uuid, text) to service_role;
