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

-- Reconcile the deployed admin_settings shape. The canonical payload column is
-- setting_value and the canonical identifier remains text.
create table if not exists public.admin_settings (
  id text,
  setting_key text,
  setting_value jsonb,
  description text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.admin_settings
  add column if not exists id text,
  add column if not exists setting_key text,
  add column if not exists setting_value jsonb,
  add column if not exists description text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

do $$
declare
  v_id_type text;
begin
  select data_type
  into v_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'admin_settings'
    and column_name = 'id';

  if v_id_type is distinct from 'text' then
    alter table public.admin_settings alter column id drop default;
    alter table public.admin_settings alter column id type text using id::text;
  end if;
end;
$$;

update public.admin_settings
set id = 'reconciled_' || replace(gen_random_uuid()::text, '-', '')
where id is null;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by id
      order by created_at nulls last, updated_at nulls last, ctid
    ) as duplicate_rank
  from public.admin_settings
)
update public.admin_settings as settings
set id = settings.id || '__reconciled_' || replace(gen_random_uuid()::text, '-', '')
from ranked
where settings.ctid = ranked.ctid
  and ranked.duplicate_rank > 1;

create unique index if not exists admin_settings_id_reconcile_uidx
  on public.admin_settings(id);

do $$
begin
  if not exists (
    select 1
    from public.admin_settings
    where id = 'default'
  ) then
    update public.admin_settings
    set id = 'default'
    where ctid = (
      select ctid
      from public.admin_settings
      where setting_key = 'default'
      order by created_at nulls last, updated_at nulls last, ctid
      limit 1
    );
  end if;

  if not exists (
    select 1
    from public.admin_settings
    where id = 'default'
  ) then
    insert into public.admin_settings (
      id,
      setting_key,
      setting_value,
      description,
      created_at,
      updated_at
    )
    values (
      'default',
      'default',
      '{}'::jsonb,
      'Admin portal defaults',
      now(),
      now()
    );
  end if;
end;
$$;

update public.admin_settings
set
  setting_key = coalesce(nullif(setting_key, ''), id),
  setting_value = coalesce(setting_value, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now());

update public.admin_settings
set
  setting_key = 'default',
  setting_value =
    jsonb_build_object(
      'defaultPlan', 'standard',
      'defaultDurationDays', 30,
      'defaultMaxActivations', 1,
      'defaultMaxDevices', 1,
      'allowDeviceDeactivation', true,
      'expiringReminderDays', 14,
      'updateChannel', 'stable',
      'autoUpdateDownloadEnabled', false,
      'latestVersion', null,
      'minimumSupportedVersion', null,
      'pageSize', 25,
      'defaultSort', 'created_at_desc',
      'dateFormat', 'zh-CN',
      'timezone', 'Asia/Shanghai'
    )
    || case
      when jsonb_typeof(setting_value) = 'object' then setting_value
      else jsonb_build_object('_reconciledSetting', setting_value)
    end
    || jsonb_build_object(
      'defaultMaxActivations',
      coalesce(
        case
          when jsonb_typeof(setting_value) = 'object'
            and (setting_value ->> 'defaultMaxActivations') ~ '^[1-9][0-9]{0,8}$'
            then (setting_value ->> 'defaultMaxActivations')::integer
        end,
        case
          when jsonb_typeof(setting_value) = 'object'
            and (setting_value ->> 'defaultMaxDevices') ~ '^[1-9][0-9]{0,8}$'
            then (setting_value ->> 'defaultMaxDevices')::integer
        end,
        1
      )
    ),
  description = coalesce(description, 'Admin portal defaults'),
  updated_at = now()
where id = 'default';

alter table public.admin_settings
  alter column id set not null,
  alter column setting_key set not null,
  alter column setting_value set default '{}'::jsonb,
  alter column setting_value set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from public.admin_settings
    where setting_key is not null
    group by setting_key
    having count(*) > 1
  ) then
    create unique index if not exists admin_settings_setting_key_reconcile_uidx
      on public.admin_settings(setting_key)
      where setting_key is not null;
  else
    raise warning 'admin_settings.setting_key contains duplicates; preserving rows and skipping the optional unique index';
  end if;
end;
$$;

drop trigger if exists trg_admin_settings_updated_at on public.admin_settings;
create trigger trg_admin_settings_updated_at
before update on public.admin_settings
for each row execute function public.set_updated_at();

-- Reconcile supporting profile fields queried by the admin overview/users APIs.
create table if not exists public.profiles (
  id uuid,
  email text,
  role text,
  license_status text,
  license_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.profiles
  add column if not exists id uuid,
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists license_status text,
  add column if not exists license_expires_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.profiles
set
  role = coalesce(role, 'user'),
  license_status = coalesce(license_status, 'inactive'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now());

do $$
begin
  if exists (select 1 from public.profiles where id is null) then
    raise exception 'profiles contains rows with null id; refusing to discard or guess user identities';
  end if;

  if exists (
    select 1
    from public.profiles
    group by id
    having count(*) > 1
  ) then
    raise exception 'profiles contains duplicate id values; refusing to merge user records automatically';
  end if;
end;
$$;

create unique index if not exists profiles_id_reconcile_uidx
  on public.profiles(id);

do $$
declare
  v_profile_id_attnum smallint;
  v_auth_user_id_attnum smallint;
  v_constraint record;
begin
  select attnum into v_profile_id_attnum
  from pg_attribute
  where attrelid = 'public.profiles'::regclass
    and attname = 'id'
    and not attisdropped;

  select attnum into v_auth_user_id_attnum
  from pg_attribute
  where attrelid = 'auth.users'::regclass
    and attname = 'id'
    and not attisdropped;

  if not exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.profiles'::regclass
      and confrelid = 'auth.users'::regclass
      and conkey = array[v_profile_id_attnum]::smallint[]
      and confkey = array[v_auth_user_id_attnum]::smallint[]
  ) then
    alter table public.profiles
      add constraint profiles_id_reconcile_fkey
      foreign key (id)
      references auth.users(id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    left join auth.users as auth_user
      on auth_user.id = profile.id
    where auth_user.id is null
  ) then
    for v_constraint in
      select conname
      from pg_constraint
      where contype = 'f'
        and conrelid = 'public.profiles'::regclass
        and confrelid = 'auth.users'::regclass
        and not convalidated
    loop
      execute format(
        'alter table public.profiles validate constraint %I',
        v_constraint.conname
      );
    end loop;
  else
    raise warning 'profiles contains rows without matching auth.users records; preserving profiles and leaving the user foreign key not valid';
  end if;
end;
$$;

alter table public.profiles
  alter column id set not null,
  alter column role set default 'user',
  alter column role set not null,
  alter column license_status set default 'inactive',
  alter column license_status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.profiles
  drop constraint if exists profiles_role_check,
  drop constraint if exists profiles_license_status_check;

alter table public.profiles
  add constraint profiles_role_check
    check (role in ('user', 'admin')) not valid,
  add constraint profiles_license_status_check
    check (license_status in ('inactive', 'active', 'expired', 'suspended')) not valid;

do $$
begin
  if not exists (
    select 1 from public.profiles
    where role not in ('user', 'admin')
  ) then
    alter table public.profiles validate constraint profiles_role_check;
  end if;

  if not exists (
    select 1 from public.profiles
    where license_status not in ('inactive', 'active', 'expired', 'suspended')
  ) then
    alter table public.profiles validate constraint profiles_license_status_check;
  end if;
end;
$$;

-- Reconcile all license fields read or written by the admin and web-license APIs.
create table if not exists public.license_codes (
  id uuid,
  code_hash text,
  code_value text,
  code_prefix text,
  plan text,
  duration_days integer,
  max_activations integer,
  activation_count integer,
  status text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  note text
);

alter table public.license_codes
  add column if not exists id uuid,
  add column if not exists code_hash text,
  add column if not exists code_value text,
  add column if not exists code_prefix text,
  add column if not exists plan text,
  add column if not exists duration_days integer,
  add column if not exists max_activations integer,
  add column if not exists activation_count integer,
  add column if not exists status text,
  add column if not exists expires_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists note text;

update public.license_codes
set id = gen_random_uuid()
where id is null;

update public.license_codes
set
  code_hash = coalesce(nullif(code_hash, ''), 'reconciled:' || id::text),
  code_prefix = coalesce(
    nullif(code_prefix, ''),
    left(coalesce(nullif(code_value, ''), id::text), 16)
  ),
  plan = coalesce(nullif(plan, ''), 'standard'),
  duration_days = case when duration_days is null or duration_days <= 0 then 365 else duration_days end,
  max_activations = case when max_activations is null or max_activations <= 0 then 1 else max_activations end,
  activation_count = case when activation_count is null or activation_count < 0 then 0 else activation_count end,
  status = coalesce(nullif(status, ''), 'unused'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now());

do $$
begin
  if exists (
    select 1
    from public.license_codes
    group by id
    having count(*) > 1
  ) then
    raise exception 'license_codes contains duplicate id values; refusing to re-key licenses with existing bindings';
  end if;

  if exists (
    select 1
    from public.license_codes
    group by code_hash
    having count(*) > 1
  ) then
    raise exception 'license_codes contains duplicate code_hash values; refusing to invalidate existing activation codes';
  end if;
end;
$$;

create unique index if not exists license_codes_id_reconcile_uidx
  on public.license_codes(id);

create unique index if not exists license_codes_code_hash_reconcile_uidx
  on public.license_codes(code_hash);

do $$
declare
  v_created_by_attnum smallint;
  v_auth_user_id_attnum smallint;
  v_constraint record;
begin
  select attnum into v_created_by_attnum
  from pg_attribute
  where attrelid = 'public.license_codes'::regclass
    and attname = 'created_by'
    and not attisdropped;

  select attnum into v_auth_user_id_attnum
  from pg_attribute
  where attrelid = 'auth.users'::regclass
    and attname = 'id'
    and not attisdropped;

  if not exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.license_codes'::regclass
      and confrelid = 'auth.users'::regclass
      and conkey = array[v_created_by_attnum]::smallint[]
      and confkey = array[v_auth_user_id_attnum]::smallint[]
  ) then
    alter table public.license_codes
      add constraint license_codes_created_by_reconcile_fkey
      foreign key (created_by)
      references auth.users(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1
    from public.license_codes as license
    left join auth.users as auth_user
      on auth_user.id = license.created_by
    where license.created_by is not null
      and auth_user.id is null
  ) then
    for v_constraint in
      select conname
      from pg_constraint
      where contype = 'f'
        and conrelid = 'public.license_codes'::regclass
        and confrelid = 'auth.users'::regclass
        and not convalidated
    loop
      execute format(
        'alter table public.license_codes validate constraint %I',
        v_constraint.conname
      );
    end loop;
  else
    raise warning 'license_codes.created_by contains orphaned user ids; preserving licenses and leaving the creator foreign key not valid';
  end if;
end;
$$;

alter table public.license_codes
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column code_hash set not null,
  alter column code_prefix set not null,
  alter column plan set default 'standard',
  alter column plan set not null,
  alter column duration_days set not null,
  alter column max_activations set default 1,
  alter column max_activations set not null,
  alter column activation_count set default 0,
  alter column activation_count set not null,
  alter column status set default 'unused',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.license_codes
  drop constraint if exists license_codes_duration_days_check,
  drop constraint if exists license_codes_max_activations_check,
  drop constraint if exists license_codes_activation_count_check,
  drop constraint if exists license_codes_status_check;

alter table public.license_codes
  add constraint license_codes_duration_days_check
    check (duration_days > 0) not valid,
  add constraint license_codes_max_activations_check
    check (max_activations > 0) not valid,
  add constraint license_codes_activation_count_check
    check (activation_count >= 0) not valid,
  add constraint license_codes_status_check
    check (status in ('unused', 'active', 'exhausted', 'disabled', 'expired', 'revoked')) not valid;

do $$
begin
  if not exists (
    select 1 from public.license_codes
    where duration_days <= 0
  ) then
    alter table public.license_codes validate constraint license_codes_duration_days_check;
  end if;

  if not exists (
    select 1 from public.license_codes
    where max_activations <= 0
  ) then
    alter table public.license_codes validate constraint license_codes_max_activations_check;
  end if;

  if not exists (
    select 1 from public.license_codes
    where activation_count < 0
  ) then
    alter table public.license_codes validate constraint license_codes_activation_count_check;
  end if;

  if not exists (
    select 1 from public.license_codes
    where status not in ('unused', 'active', 'exhausted', 'disabled', 'expired', 'revoked')
  ) then
    alter table public.license_codes validate constraint license_codes_status_check;
  end if;
end;
$$;

create table if not exists public.license_activations (
  id uuid,
  license_id uuid,
  user_id uuid,
  email text,
  activated_at timestamptz,
  expires_at timestamptz,
  status text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz
);

alter table public.license_activations
  add column if not exists id uuid,
  add column if not exists license_id uuid,
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists activated_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists status text,
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text,
  add column if not exists created_at timestamptz;

update public.license_activations
set id = gen_random_uuid()
where id is null;

update public.license_activations as activation
set email = coalesce(
  nullif(activation.email, ''),
  nullif(auth_user.email, ''),
  'unknown+' || activation.user_id::text || '@invalid.local'
)
from auth.users as auth_user
where activation.user_id = auth_user.id
  and (activation.email is null or activation.email = '');

update public.license_activations
set
  email = coalesce(
    nullif(email, ''),
    'unknown+' || coalesce(user_id::text, id::text) || '@invalid.local'
  ),
  activated_at = coalesce(activated_at, created_at, now()),
  expires_at = coalesce(
    expires_at,
    coalesce(activated_at, created_at, now()) + interval '365 days'
  ),
  status = coalesce(nullif(status, ''), 'active'),
  created_at = coalesce(created_at, activated_at, now());

do $$
begin
  if exists (
    select 1 from public.license_activations
    where license_id is null
  ) then
    raise exception 'license_activations contains null license_id values; refusing to guess license relationships';
  end if;

  if exists (
    select 1 from public.license_activations
    where user_id is null
  ) then
    raise exception 'license_activations contains null user_id values; refusing to guess user relationships';
  end if;

  if exists (
    select 1
    from public.license_activations
    group by id
    having count(*) > 1
  ) then
    raise exception 'license_activations contains duplicate id values; refusing to merge binding records automatically';
  end if;
end;
$$;

create unique index if not exists license_activations_id_reconcile_uidx
  on public.license_activations(id);

alter table public.license_activations
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column license_id set not null,
  alter column user_id set not null,
  alter column email set not null,
  alter column activated_at set default now(),
  alter column activated_at set not null,
  alter column expires_at set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.license_activations
  drop constraint if exists license_activations_status_check;

alter table public.license_activations
  add constraint license_activations_status_check
    check (status in ('active', 'expired', 'revoked', 'suspended')) not valid;

do $$
begin
  if not exists (
    select 1 from public.license_activations
    where status not in ('active', 'expired', 'revoked', 'suspended')
  ) then
    alter table public.license_activations validate constraint license_activations_status_check;
  end if;
end;
$$;

do $$
declare
  v_activation_license_attnum smallint;
  v_activation_user_attnum smallint;
  v_license_id_attnum smallint;
  v_auth_user_id_attnum smallint;
begin
  select attnum into v_activation_license_attnum
  from pg_attribute
  where attrelid = 'public.license_activations'::regclass
    and attname = 'license_id'
    and not attisdropped;

  select attnum into v_activation_user_attnum
  from pg_attribute
  where attrelid = 'public.license_activations'::regclass
    and attname = 'user_id'
    and not attisdropped;

  select attnum into v_license_id_attnum
  from pg_attribute
  where attrelid = 'public.license_codes'::regclass
    and attname = 'id'
    and not attisdropped;

  select attnum into v_auth_user_id_attnum
  from pg_attribute
  where attrelid = 'auth.users'::regclass
    and attname = 'id'
    and not attisdropped;

  if not exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.license_activations'::regclass
      and confrelid = 'public.license_codes'::regclass
      and conkey = array[v_activation_license_attnum]::smallint[]
      and confkey = array[v_license_id_attnum]::smallint[]
  ) then
    alter table public.license_activations
      add constraint license_activations_license_id_reconcile_fkey
      foreign key (license_id)
      references public.license_codes(id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.license_activations'::regclass
      and confrelid = 'auth.users'::regclass
      and conkey = array[v_activation_user_attnum]::smallint[]
      and confkey = array[v_auth_user_id_attnum]::smallint[]
  ) then
    alter table public.license_activations
      add constraint license_activations_user_id_reconcile_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade
      not valid;
  end if;
end;
$$;

do $$
declare
  v_constraint record;
begin
  if not exists (
    select 1
    from public.license_activations as activation
    left join public.license_codes as license
      on license.id = activation.license_id
    where license.id is null
  ) then
    for v_constraint in
      select conname
      from pg_constraint
      where contype = 'f'
        and conrelid = 'public.license_activations'::regclass
        and confrelid = 'public.license_codes'::regclass
        and not convalidated
    loop
      execute format(
        'alter table public.license_activations validate constraint %I',
        v_constraint.conname
      );
    end loop;
  else
    raise warning 'license_activations contains orphaned license_id values; preserving rows and leaving the license foreign key not valid';
  end if;

  if not exists (
    select 1
    from public.license_activations as activation
    left join auth.users as auth_user
      on auth_user.id = activation.user_id
    where auth_user.id is null
  ) then
    for v_constraint in
      select conname
      from pg_constraint
      where contype = 'f'
        and conrelid = 'public.license_activations'::regclass
        and confrelid = 'auth.users'::regclass
        and not convalidated
    loop
      execute format(
        'alter table public.license_activations validate constraint %I',
        v_constraint.conname
      );
    end loop;
  else
    raise warning 'license_activations contains orphaned user_id values; preserving rows and leaving the user foreign key not valid';
  end if;
end;
$$;

with binding_counts as (
  select
    license_id,
    count(*) filter (
      where revoked_reason is distinct from 'EMAIL_UNBOUND'
    )::integer as activation_count
  from public.license_activations
  group by license_id
)
update public.license_codes as license
set
  activation_count = coalesce(binding_counts.activation_count, 0),
  status = case
    when license.status in ('disabled', 'revoked', 'expired') then license.status
    when license.expires_at is not null and license.expires_at <= now() then 'expired'
    when coalesce(binding_counts.activation_count, 0) = 0 then 'unused'
    when coalesce(binding_counts.activation_count, 0) >= license.max_activations then 'exhausted'
    else 'active'
  end
from binding_counts
where binding_counts.license_id = license.id
  and (
    license.activation_count is distinct from binding_counts.activation_count
    or license.status is distinct from case
      when license.status in ('disabled', 'revoked', 'expired') then license.status
      when license.expires_at is not null and license.expires_at <= now() then 'expired'
      when binding_counts.activation_count = 0 then 'unused'
      when binding_counts.activation_count >= license.max_activations then 'exhausted'
      else 'active'
    end
  );

update public.license_codes as license
set
  activation_count = 0,
  status = case
    when license.status in ('disabled', 'revoked', 'expired') then license.status
    when license.expires_at is not null and license.expires_at <= now() then 'expired'
    else 'unused'
  end
where not exists (
    select 1
    from public.license_activations as activation
    where activation.license_id = license.id
      and activation.revoked_reason is distinct from 'EMAIL_UNBOUND'
  )
  and (
    license.activation_count <> 0
    or license.status not in ('unused', 'disabled', 'revoked', 'expired')
  );

create index if not exists idx_license_codes_prefix
  on public.license_codes(code_prefix);
create index if not exists idx_license_codes_status
  on public.license_codes(status);
create index if not exists idx_license_codes_expires_at
  on public.license_codes(expires_at);
create index if not exists idx_license_activations_user_status
  on public.license_activations(user_id, status, expires_at desc);
create index if not exists idx_license_activations_license_id
  on public.license_activations(license_id);
create index if not exists idx_license_activations_email
  on public.license_activations(email);

do $$
begin
  if not exists (
    select 1
    from public.license_activations
    where status = 'active'
    group by user_id
    having count(*) > 1
  ) then
    create unique index if not exists idx_license_activations_one_active_user
      on public.license_activations(user_id)
      where status = 'active';
  else
    raise warning 'multiple active license_activations exist for at least one user; preserving bindings and skipping the partial unique index';
  end if;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_license_codes_updated_at on public.license_codes;
create trigger trg_license_codes_updated_at
before update on public.license_codes
for each row execute function public.set_updated_at();

-- Reconcile usage fields queried by /api/admin/users.
create table if not exists public.usage_records (
  id uuid,
  user_id uuid,
  license_id uuid,
  action text,
  model text,
  input_tokens integer,
  output_tokens integer,
  success boolean,
  error_message text,
  created_at timestamptz
);

alter table public.usage_records
  add column if not exists id uuid,
  add column if not exists user_id uuid,
  add column if not exists license_id uuid,
  add column if not exists action text,
  add column if not exists model text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists success boolean,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz;

update public.usage_records
set
  id = coalesce(id, gen_random_uuid()),
  success = coalesce(success, true),
  created_at = coalesce(created_at, now());

alter table public.usage_records
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column success set default true,
  alter column success set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_usage_records_user_created_at
  on public.usage_records(user_id, created_at desc);

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

  if v_license.status = 'expired'
    or (v_license.expires_at is not null and v_license.expires_at <= v_now)
  then
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
        and revoked_reason is distinct from 'EMAIL_UNBOUND'
    )
  then
    return query select false, 'LICENSE_ALREADY_USED', '激活码已绑定其他邮箱', null::timestamptz, v_license.plan, v_license.id;
    return;
  end if;

  if v_license.activation_count >= v_license.max_activations
    or v_license.status = 'exhausted'
  then
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
      status = case
        when v_next_count >= v_license.max_activations then 'exhausted'
        else 'active'
      end
  where id = v_license.id;

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
    return query
    select false, 'INTERNAL_ERROR', '激活失败，请稍后重试', null::timestamptz, null::text, null::uuid;
end;
$$;

alter table public.admin_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.license_codes enable row level security;
alter table public.license_activations enable row level security;
alter table public.usage_records enable row level security;

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

revoke all on public.admin_settings from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.license_codes from anon, authenticated;
revoke all on public.license_activations from anon, authenticated;
revoke all on public.usage_records from anon, authenticated;
revoke all on function public.activate_license_code(text, uuid, text) from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (email) on public.profiles to authenticated;
grant select on public.license_activations to authenticated;
grant select on public.usage_records to authenticated;

grant select, insert, update, delete on public.admin_settings to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.license_codes to service_role;
grant select, insert, update, delete on public.license_activations to service_role;
grant select, insert, update, delete on public.usage_records to service_role;
grant execute on function public.activate_license_code(text, uuid, text) to service_role;
