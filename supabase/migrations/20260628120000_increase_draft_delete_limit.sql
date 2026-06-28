-- Increase daily draft deletion limit from 3 to 8

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
    'dailyLimit', 8,
    'used', v_used,
    'remaining', greatest(0, 8 - v_used),
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

  if v_used >= 8 then
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
    'dailyLimit', 8,
    'used', v_used + 1,
    'remaining', greatest(0, 7 - v_used),
    'date', v_today
  );
end;
$$;
