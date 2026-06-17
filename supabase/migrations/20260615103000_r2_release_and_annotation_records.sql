alter table public.app_releases
  add column if not exists status text not null default 'draft',
  add column if not exists storage_provider text,
  add column if not exists artifacts jsonb,
  add column if not exists failure_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_releases_status_check'
  ) then
    alter table public.app_releases
      add constraint app_releases_status_check
      check (status in ('draft', 'uploading', 'failed', 'published'));
  end if;
end $$;

update public.app_releases
set status = case when published then 'published' else coalesce(nullif(status, ''), 'draft') end;

create index if not exists idx_app_releases_status_created_at
  on public.app_releases(status, created_at desc);

create table if not exists public.writing_records (
  id uuid primary key default gen_random_uuid(),
  device_hash text,
  task_type text not null check (task_type in ('task1', 'task2', 'mock')),
  title text not null,
  prompt text,
  original_essay text not null,
  corrected_essay text,
  improved_essay text,
  model_essay text,
  evaluation jsonb not null default '{}'::jsonb,
  annotations jsonb not null default '[]'::jsonb,
  accepted_changes jsonb not null default '[]'::jsonb,
  annotation_version integer not null default 1,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.writing_records
  add column if not exists original_essay text,
  add column if not exists corrected_essay text,
  add column if not exists improved_essay text,
  add column if not exists model_essay text,
  add column if not exists annotations jsonb not null default '[]'::jsonb,
  add column if not exists accepted_changes jsonb not null default '[]'::jsonb,
  add column if not exists annotation_version integer not null default 1;

create index if not exists idx_writing_records_submitted_at
  on public.writing_records(submitted_at desc);

create index if not exists idx_writing_records_annotation_version
  on public.writing_records(annotation_version);

drop trigger if exists trg_writing_records_updated_at on public.writing_records;
create trigger trg_writing_records_updated_at
before update on public.writing_records
for each row execute function public.set_updated_at();

alter table public.writing_records enable row level security;
revoke all on public.writing_records from anon, authenticated;
grant select, insert, update, delete on public.writing_records to service_role;
