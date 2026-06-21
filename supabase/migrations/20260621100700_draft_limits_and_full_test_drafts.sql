alter table public.writing_drafts
  add column if not exists request_id text,
  add column if not exists created_at timestamptz not null default now();

update public.writing_drafts
set request_id = id
where request_id is null;

alter table public.writing_drafts
  alter column request_id set not null;

create unique index if not exists idx_writing_drafts_user_request
  on public.writing_drafts(user_id, request_id);

create index if not exists idx_writing_drafts_user_type_updated
  on public.writing_drafts(user_id, task_type, updated_at desc);

with legacy_users as (
  select distinct user_id
  from public.writing_drafts
  where id in (
    'ielts-writing-draft-mock-task1',
    'ielts-writing-draft-mock-task2'
  )
),
legacy_mock as (
  select
    legacy_users.user_id,
    (
      select draft_data
      from public.writing_drafts task1
      where task1.user_id = legacy_users.user_id
        and task1.id = 'ielts-writing-draft-mock-task1'
      limit 1
    ) as task1_data,
    (
      select draft_data
      from public.writing_drafts task2
      where task2.user_id = legacy_users.user_id
        and task2.id = 'ielts-writing-draft-mock-task2'
      limit 1
    ) as task2_data,
    (
      select min(created_at)
      from public.writing_drafts draft
      where draft.user_id = legacy_users.user_id
        and draft.id in (
          'ielts-writing-draft-mock-task1',
          'ielts-writing-draft-mock-task2'
        )
    ) as created_at,
    (
      select max(updated_at)
      from public.writing_drafts draft
      where draft.user_id = legacy_users.user_id
        and draft.id in (
          'ielts-writing-draft-mock-task1',
          'ielts-writing-draft-mock-task2'
        )
    ) as updated_at
  from legacy_users
)
insert into public.writing_drafts (
  id,
  user_id,
  task_type,
  request_id,
  draft_data,
  created_at,
  updated_at
)
select
  'ielts-writing-draft-mock',
  user_id,
  'mock',
  'legacy-full-test-v2',
  pg_catalog.jsonb_build_object(
    'version', 2,
    'kind', 'full_test',
    'selection', pg_catalog.jsonb_build_object(
      'task1ChartType', 'random',
      'task1Subtype', 'random',
      'task2EssayType', 'random',
      'task2Topic', 'random'
    ),
    'activeTask', 'task1',
    'remainingSeconds', 3600,
    'task1', coalesce(task1_data, pg_catalog.jsonb_build_object(
      'essay', '',
      'updatedAt', coalesce(updated_at, now()),
      'wordCount', 0
    )),
    'task2', coalesce(task2_data, pg_catalog.jsonb_build_object(
      'essay', '',
      'updatedAt', coalesce(updated_at, now()),
      'wordCount', 0
    ))
  ),
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from legacy_mock
on conflict (user_id, id) do nothing;

delete from public.writing_drafts
where id in (
  'ielts-writing-draft-mock-task1',
  'ielts-writing-draft-mock-task2'
);

create table if not exists public.draft_deletion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id text not null,
  draft_type text not null check (draft_type in ('task1', 'task2', 'mock')),
  deleted_at timestamptz not null default now()
);

create index if not exists idx_draft_deletion_events_user_deleted
  on public.draft_deletion_events(user_id, deleted_at desc);

alter table public.draft_deletion_events enable row level security;

drop policy if exists "draft_deletion_events_select_own" on public.draft_deletion_events;
create policy "draft_deletion_events_select_own"
on public.draft_deletion_events
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "writing_drafts_insert_own" on public.writing_drafts;
drop policy if exists "writing_drafts_update_own" on public.writing_drafts;
drop policy if exists "writing_drafts_delete_own" on public.writing_drafts;

revoke insert, update, delete on public.writing_drafts from authenticated;
revoke insert, update, delete on public.draft_deletion_events from anon, authenticated;
grant select on public.writing_drafts to authenticated;
grant select on public.draft_deletion_events to authenticated;
grant select, insert, update, delete on public.writing_drafts to service_role;
grant select, insert, update, delete on public.draft_deletion_events to service_role;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.create_writing_draft(
  p_id text,
  p_task_type text,
  p_request_id text,
  p_draft_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_count integer;
  v_existing public.writing_drafts%rowtype;
  v_created public.writing_drafts%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'DRAFT_ACCESS_DENIED';
  end if;

  if p_task_type not in ('task1', 'task2', 'mock') then
    raise exception using errcode = 'P0001', message = 'DRAFT_CREATE_FAILED';
  end if;

  if length(p_id) < 1 or length(p_id) > 180
    or length(p_request_id) < 1 or length(p_request_id) > 180 then
    raise exception using errcode = 'P0001', message = 'DRAFT_CREATE_FAILED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':draft-create:' || p_task_type, 0)
  );

  select *
  into v_existing
  from public.writing_drafts
  where user_id = v_user_id
    and request_id = p_request_id;

  if found then
    return pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'taskType', v_existing.task_type,
      'created', false,
      'createdAt', v_existing.created_at,
      'updatedAt', v_existing.updated_at
    );
  end if;

  v_limit := case when p_task_type = 'mock' then 3 else 5 end;

  select count(*)
  into v_count
  from public.writing_drafts
  where user_id = v_user_id
    and task_type = p_task_type
    and (draft_data ->> 'completed') is distinct from 'true';

  if v_count >= v_limit then
    raise exception using
      errcode = 'P0001',
      message = case
        when p_task_type = 'task1' then 'DRAFT_LIMIT_REACHED_TASK1'
        when p_task_type = 'task2' then 'DRAFT_LIMIT_REACHED_TASK2'
        else 'DRAFT_LIMIT_REACHED_FULL_TEST'
      end;
  end if;

  insert into public.writing_drafts (
    id,
    user_id,
    task_type,
    request_id,
    draft_data,
    created_at,
    updated_at
  )
  values (
    p_id,
    v_user_id,
    p_task_type,
    p_request_id,
    coalesce(p_draft_data, '{}'::jsonb),
    now(),
    now()
  )
  returning * into v_created;

  return pg_catalog.jsonb_build_object(
    'id', v_created.id,
    'taskType', v_created.task_type,
    'created', true,
    'createdAt', v_created.created_at,
    'updatedAt', v_created.updated_at
  );
end;
$$;

create or replace function private.update_writing_draft(
  p_id text,
  p_task_type text,
  p_draft_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated public.writing_drafts%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'DRAFT_ACCESS_DENIED';
  end if;

  update public.writing_drafts
  set draft_data = coalesce(p_draft_data, '{}'::jsonb),
      updated_at = now()
  where user_id = v_user_id
    and id = p_id
    and task_type = p_task_type
    and (draft_data ->> 'completed') is distinct from 'true'
  returning * into v_updated;

  if not found then
    raise exception using errcode = 'P0001', message = 'DRAFT_NOT_FOUND';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_updated.id,
    'taskType', v_updated.task_type,
    'updatedAt', v_updated.updated_at
  );
end;
$$;

create or replace function private.complete_writing_draft(
  p_id text,
  p_record_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated public.writing_drafts%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'DRAFT_ACCESS_DENIED';
  end if;

  if not exists (
    select 1
    from public.writing_records
    where user_id = v_user_id
      and id = p_record_id
  ) then
    raise exception using errcode = 'P0001', message = 'DRAFT_UPDATE_FAILED';
  end if;

  update public.writing_drafts
  set draft_data = draft_data || pg_catalog.jsonb_build_object(
        'completed', true,
        'completedAt', now(),
        'completedRecordId', p_record_id
      ),
      updated_at = now()
  where user_id = v_user_id
    and id = p_id
    and (draft_data ->> 'completed') is distinct from 'true'
  returning * into v_updated;

  if not found then
    raise exception using errcode = 'P0001', message = 'DRAFT_NOT_FOUND';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_updated.id,
    'completed', true,
    'updatedAt', v_updated.updated_at
  );
end;
$$;

create or replace function private.get_writing_draft_delete_quota()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
  v_used integer;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'DRAFT_ACCESS_DENIED';
  end if;

  v_today := pg_catalog.timezone('Asia/Shanghai', now())::date;

  select count(*)
  into v_used
  from public.draft_deletion_events
  where user_id = v_user_id
    and pg_catalog.timezone('Asia/Shanghai', deleted_at)::date = v_today;

  return pg_catalog.jsonb_build_object(
    'timezone', 'Asia/Shanghai',
    'dailyLimit', 3,
    'used', v_used,
    'remaining', greatest(0, 3 - v_used),
    'date', v_today
  );
end;
$$;

create or replace function private.delete_writing_draft(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date;
  v_used integer;
  v_task_type text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'DRAFT_ACCESS_DENIED';
  end if;

  v_today := pg_catalog.timezone('Asia/Shanghai', now())::date;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':draft-delete:' || v_today::text, 0)
  );

  select count(*)
  into v_used
  from public.draft_deletion_events
  where user_id = v_user_id
    and pg_catalog.timezone('Asia/Shanghai', deleted_at)::date = v_today;

  if v_used >= 3 then
    raise exception using
      errcode = 'P0001',
      message = 'DAILY_DRAFT_DELETE_LIMIT_REACHED';
  end if;

  delete from public.writing_drafts
  where user_id = v_user_id
    and id = p_id
    and (draft_data ->> 'completed') is distinct from 'true'
  returning task_type into v_task_type;

  if not found then
    raise exception using errcode = 'P0001', message = 'DRAFT_NOT_FOUND';
  end if;

  insert into public.draft_deletion_events (
    user_id,
    draft_id,
    draft_type,
    deleted_at
  )
  values (
    v_user_id,
    p_id,
    v_task_type,
    now()
  );

  return pg_catalog.jsonb_build_object(
    'id', p_id,
    'deleted', true,
    'timezone', 'Asia/Shanghai',
    'dailyLimit', 3,
    'used', v_used + 1,
    'remaining', greatest(0, 2 - v_used),
    'date', v_today
  );
end;
$$;

create or replace function public.create_writing_draft(
  p_id text,
  p_task_type text,
  p_request_id text,
  p_draft_data jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_writing_draft(p_id, p_task_type, p_request_id, p_draft_data);
$$;

create or replace function public.update_writing_draft(
  p_id text,
  p_task_type text,
  p_draft_data jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_writing_draft(p_id, p_task_type, p_draft_data);
$$;

create or replace function public.complete_writing_draft(
  p_id text,
  p_record_id text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.complete_writing_draft(p_id, p_record_id);
$$;

create or replace function public.get_writing_draft_delete_quota()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.get_writing_draft_delete_quota();
$$;

create or replace function public.delete_writing_draft(p_id text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.delete_writing_draft(p_id);
$$;

revoke all on function private.create_writing_draft(text, text, text, jsonb) from public;
revoke all on function private.update_writing_draft(text, text, jsonb) from public;
revoke all on function private.complete_writing_draft(text, text) from public;
revoke all on function private.get_writing_draft_delete_quota() from public;
revoke all on function private.delete_writing_draft(text) from public;

grant execute on function private.create_writing_draft(text, text, text, jsonb) to authenticated, service_role;
grant execute on function private.update_writing_draft(text, text, jsonb) to authenticated, service_role;
grant execute on function private.complete_writing_draft(text, text) to authenticated, service_role;
grant execute on function private.get_writing_draft_delete_quota() to authenticated, service_role;
grant execute on function private.delete_writing_draft(text) to authenticated, service_role;

revoke all on function public.create_writing_draft(text, text, text, jsonb) from public;
revoke all on function public.update_writing_draft(text, text, jsonb) from public;
revoke all on function public.complete_writing_draft(text, text) from public;
revoke all on function public.get_writing_draft_delete_quota() from public;
revoke all on function public.delete_writing_draft(text) from public;

grant execute on function public.create_writing_draft(text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.update_writing_draft(text, text, jsonb) to authenticated, service_role;
grant execute on function public.complete_writing_draft(text, text) to authenticated, service_role;
grant execute on function public.get_writing_draft_delete_quota() to authenticated, service_role;
grant execute on function public.delete_writing_draft(text) to authenticated, service_role;
