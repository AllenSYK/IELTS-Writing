alter table public.writing_records
  add column if not exists record_data jsonb not null default '{}'::jsonb,
  add column if not exists request_id text,
  add column if not exists processing_status text not null default 'complete',
  add column if not exists failed_block_ids text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_records_processing_status_check'
  ) then
    alter table public.writing_records
      add constraint writing_records_processing_status_check
      check (processing_status in ('scoring', 'annotating', 'partial', 'complete', 'failed'));
  end if;
end $$;

create unique index if not exists idx_writing_records_user_request
  on public.writing_records(user_id, request_id)
  where request_id is not null;

create table if not exists public.writing_drafts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null check (task_type in ('task1', 'task2', 'mock')),
  draft_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_writing_drafts_user_updated_at
  on public.writing_drafts(user_id, updated_at desc);

create table if not exists public.user_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agreement_type text not null check (agreement_type in ('terms', 'privacy')),
  agreement_version text not null,
  accepted_at timestamptz not null default now(),
  source text,
  unique (user_id, agreement_type, agreement_version)
);

create index if not exists idx_user_agreements_user_accepted
  on public.user_agreements(user_id, accepted_at desc);

alter table public.writing_drafts enable row level security;
alter table public.user_agreements enable row level security;
alter table public.writing_records enable row level security;

drop policy if exists "writing_records_select_own" on public.writing_records;
create policy "writing_records_select_own"
on public.writing_records
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "writing_records_insert_own" on public.writing_records;
create policy "writing_records_insert_own"
on public.writing_records
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "writing_records_update_own" on public.writing_records;
create policy "writing_records_update_own"
on public.writing_records
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "writing_records_delete_own" on public.writing_records;
create policy "writing_records_delete_own"
on public.writing_records
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "writing_drafts_select_own" on public.writing_drafts;
create policy "writing_drafts_select_own"
on public.writing_drafts
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "writing_drafts_insert_own" on public.writing_drafts;
create policy "writing_drafts_insert_own"
on public.writing_drafts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "writing_drafts_update_own" on public.writing_drafts;
create policy "writing_drafts_update_own"
on public.writing_drafts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "writing_drafts_delete_own" on public.writing_drafts;
create policy "writing_drafts_delete_own"
on public.writing_drafts
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "user_agreements_select_own" on public.user_agreements;
create policy "user_agreements_select_own"
on public.user_agreements
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.writing_drafts from anon, authenticated;
revoke all on public.user_agreements from anon, authenticated;

grant select, insert, update, delete on public.writing_drafts to authenticated;
grant select on public.user_agreements to authenticated;

grant select, insert, update, delete on public.writing_drafts to service_role;
grant select, insert, update, delete on public.user_agreements to service_role;
