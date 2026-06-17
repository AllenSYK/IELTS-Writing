alter table public.license_keys
  add column if not exists note text,
  add column if not exists product_name text not null default 'IELTS Writing',
  add column if not exists internal_note text,
  add column if not exists allow_device_deactivation boolean not null default true;

alter table public.license_events
  add column if not exists actor text,
  add column if not exists ip_hash text;

alter table public.app_releases
  add column if not exists metadata_url text,
  add column if not exists sha512 text,
  add column if not exists file_size bigint check (file_size is null or file_size >= 0),
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists check_count integer not null default 0 check (check_count >= 0),
  add column if not exists download_count integer not null default 0 check (download_count >= 0);

update public.app_releases
set
  sha512 = coalesce(sha512, file_hash),
  published_at = coalesce(published_at, created_at)
where published = true;

create index if not exists idx_license_keys_product_plan on public.license_keys(product_name, plan);
create index if not exists idx_license_keys_created_at on public.license_keys(created_at desc);
create index if not exists idx_license_events_type_created_at on public.license_events(event_type, created_at desc);
create index if not exists idx_app_releases_published_at on public.app_releases(published_at desc);

drop trigger if exists trg_app_releases_updated_at on public.app_releases;
create trigger trg_app_releases_updated_at
before update on public.app_releases
for each row execute function public.set_updated_at();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage'
      and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ielts-app-updates', 'ielts-app-updates', true, null, null)
    on conflict (id) do update
      set public = true;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage'
      and table_name = 'objects'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read IELTS app update files'
  ) then
    create policy "Public read IELTS app update files"
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'ielts-app-updates');
  end if;
end $$;
