create extension if not exists pgcrypto;

create table if not exists public.license_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  key_prefix text not null,
  key_last_four text not null,
  plan text not null default 'standard',
  status text not null default 'unused' check (status in ('unused', 'active', 'expired', 'suspended', 'revoked', 'disabled')),
  duration_days integer check (duration_days is null or duration_days > 0),
  starts_on_first_activation boolean not null default true,
  activated_at timestamptz,
  expires_at timestamptz,
  max_devices integer check (max_devices is null or max_devices > 0),
  max_activations integer check (max_activations is null or max_activations > 0),
  activation_count integer not null default 0 check (activation_count >= 0),
  auto_update_enabled boolean not null default true,
  minimum_app_version text,
  maximum_app_version text,
  admin_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.license_keys(id) on delete cascade,
  device_hash text not null,
  device_name text,
  operating_system text,
  app_version text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_ip_hash text,
  status text not null default 'active' check (status in ('active', 'deactivated', 'blocked')),
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (license_id, device_hash)
);

create table if not exists public.license_events (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references public.license_keys(id) on delete set null,
  device_id uuid references public.license_devices(id) on delete set null,
  event_type text not null,
  success boolean not null default true,
  reason text,
  app_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  channel text not null default 'stable' check (channel in ('stable', 'beta')),
  platform text not null,
  architecture text not null,
  download_url text not null,
  release_notes text,
  file_hash text,
  signature text,
  minimum_supported_version text,
  mandatory boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (version, channel, platform, architecture)
);

create table if not exists public.license_rate_limits (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  subject_hash text not null,
  count integer not null default 1,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, subject_hash)
);

create index if not exists idx_license_keys_status on public.license_keys(status);
create index if not exists idx_license_keys_expires_at on public.license_keys(expires_at);
create index if not exists idx_license_devices_license_id on public.license_devices(license_id);
create index if not exists idx_license_devices_hash on public.license_devices(device_hash);
create index if not exists idx_license_events_license_id_created_at on public.license_events(license_id, created_at desc);
create index if not exists idx_app_releases_lookup on public.app_releases(channel, platform, architecture, published, created_at desc);
create index if not exists idx_rate_limits_window on public.license_rate_limits(bucket, subject_hash, window_started_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_license_keys_updated_at on public.license_keys;
create trigger trg_license_keys_updated_at
before update on public.license_keys
for each row execute function public.set_updated_at();

drop trigger if exists trg_license_devices_updated_at on public.license_devices;
create trigger trg_license_devices_updated_at
before update on public.license_devices
for each row execute function public.set_updated_at();

drop trigger if exists trg_license_rate_limits_updated_at on public.license_rate_limits;
create trigger trg_license_rate_limits_updated_at
before update on public.license_rate_limits
for each row execute function public.set_updated_at();

alter table public.license_keys enable row level security;
alter table public.license_devices enable row level security;
alter table public.license_events enable row level security;
alter table public.app_releases enable row level security;
alter table public.license_rate_limits enable row level security;

revoke all on public.license_keys from anon, authenticated;
revoke all on public.license_devices from anon, authenticated;
revoke all on public.license_events from anon, authenticated;
revoke all on public.app_releases from anon, authenticated;
revoke all on public.license_rate_limits from anon, authenticated;

grant select, insert, update, delete on public.license_keys to service_role;
grant select, insert, update, delete on public.license_devices to service_role;
grant select, insert, update, delete on public.license_events to service_role;
grant select, insert, update, delete on public.app_releases to service_role;
grant select, insert, update, delete on public.license_rate_limits to service_role;
