create table if not exists public.admin_settings (
  id text primary key default 'default',
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (id, value)
values (
  'default',
  jsonb_build_object(
    'defaultDurationDays', 30,
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
)
on conflict (id) do nothing;

drop trigger if exists trg_admin_settings_updated_at on public.admin_settings;
create trigger trg_admin_settings_updated_at
before update on public.admin_settings
for each row execute function public.set_updated_at();

alter table public.admin_settings enable row level security;
revoke all on public.admin_settings from anon, authenticated;
grant select, insert, update, delete on public.admin_settings to service_role;
