alter table public.profiles
  add column if not exists phone text;

create unique index if not exists idx_profiles_phone_unique
  on public.profiles(phone)
  where phone is not null;

create table if not exists public.writing_task_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  task_type text not null check (task_type in ('task1', 'task2')),
  status text not null default 'processing'
    check (status in ('processing', 'parsed', 'confirmed', 'failed')),
  original_file_name text,
  mime_type text not null,
  file_extension text not null,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  pixel_width integer not null check (pixel_width > 0),
  pixel_height integer not null check (pixel_height > 0),
  content_hash text not null,
  storage_path text,
  parse_result jsonb,
  confirmed_question jsonb,
  model text,
  error_code text,
  expires_at timestamptz not null default (now() + interval '365 days'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists idx_writing_task_uploads_user_created
  on public.writing_task_uploads(user_id, created_at desc);

create index if not exists idx_writing_task_uploads_user_hash
  on public.writing_task_uploads(user_id, task_type, content_hash, created_at desc);

drop trigger if exists trg_writing_task_uploads_updated_at on public.writing_task_uploads;
create trigger trg_writing_task_uploads_updated_at
before update on public.writing_task_uploads
for each row execute function public.set_updated_at();

create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        updated_at = now();
  return new;
end;
$$;

update public.profiles as profile
set phone = auth_user.phone
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.phone is distinct from auth_user.phone;

alter table public.writing_task_uploads enable row level security;

drop policy if exists "writing_task_uploads_select_own" on public.writing_task_uploads;
create policy "writing_task_uploads_select_own"
on public.writing_task_uploads
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "writing_task_uploads_update_own" on public.writing_task_uploads;
create policy "writing_task_uploads_update_own"
on public.writing_task_uploads
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "writing_task_uploads_delete_own" on public.writing_task_uploads;
create policy "writing_task_uploads_delete_own"
on public.writing_task_uploads
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.writing_task_uploads from anon, authenticated;
grant select, update, delete on public.writing_task_uploads to authenticated;
grant select, insert, update, delete on public.writing_task_uploads to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'writing-task-uploads',
  'writing-task-uploads',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "writing_task_images_select_own" on storage.objects;
create policy "writing_task_images_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'writing-task-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "writing_task_images_insert_own" on storage.objects;
create policy "writing_task_images_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'writing-task-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "writing_task_images_delete_own" on storage.objects;
create policy "writing_task_images_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'writing-task-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
