-- ============================================================
-- Enhance study plan tables with new fields
-- ============================================================

-- Add new columns to study_plan_tasks
alter table public.study_plan_tasks
  add column if not exists title text not null default '',
  add column if not exists description text not null default '',
  add column if not exists difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  add column if not exists priority integer not null default 2
    check (priority >= 1 and priority <= 3),
  add column if not exists skip_reason text,
  add column if not exists generated_reason text not null default '',
  add column if not exists writing_mode text;

-- Add new columns to study_plans
alter table public.study_plans
  add column if not exists current_phase text not null default 'foundation';

-- Add new columns to study_plan_profiles
alter table public.study_plan_profiles
  add column if not exists intensity text not null default 'standard'
    check (intensity in ('relaxed', 'standard', 'intensive')),
  add column if not exists allow_timed_practice boolean not null default true,
  add column if not exists current_level numeric(2,1);

-- Add rescheduled status to tasks
alter table public.study_plan_tasks drop constraint if exists study_plan_tasks_status_check;
alter table public.study_plan_tasks
  add constraint study_plan_tasks_status_check
  check (status in ('pending', 'in_progress', 'completed', 'skipped', 'rescheduled'));

-- Update the complete_study_plan_task RPC to also update diagnosis
create or replace function private.complete_study_plan_task(
  p_task_id uuid,
  p_writing_record_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated public.study_plan_tasks%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'STUDY_PLAN_ACCESS_DENIED';
  end if;

  update public.study_plan_tasks
  set status = 'completed',
      writing_record_id = p_writing_record_id,
      completed_at = now()
  where id = p_task_id
    and user_id = v_user_id
    and status in ('pending', 'in_progress')
  returning * into v_updated;

  if not found then
    raise exception using errcode = 'P0001', message = 'STUDY_PLAN_TASK_NOT_FOUND';
  end if;

  return pg_catalog.jsonb_build_object(
    'taskId', v_updated.id,
    'status', 'completed',
    'completedAt', v_updated.completed_at
  );
end;
$$;

-- Add indexes for new query patterns
create index if not exists idx_study_plan_tasks_user_type_date
  on public.study_plan_tasks(user_id, task_type, scheduled_date);

create index if not exists idx_study_plan_tasks_plan_status
  on public.study_plan_tasks(plan_id, status);

-- Update the generate_study_plan_slot RPC to handle new task fields
create or replace function private.generate_study_plan_slot(
  p_period_start date,
  p_period_end date,
  p_diagnosis jsonb,
  p_preferences jsonb,
  p_goals jsonb,
  p_ai_model text,
  p_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_key text;
  v_count integer;
  v_version integer;
  v_new_plan_id uuid;
  v_task jsonb;
  v_phase text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'STUDY_PLAN_ACCESS_DENIED';
  end if;

  v_month_key := to_char(pg_catalog.timezone('Asia/Shanghai', now()), 'YYYY-MM');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':study-plan-gen:' || v_month_key, 0)
  );

  select count(*) into v_count
  from public.study_plan_generation_events
  where user_id = v_user_id
    and month_key = v_month_key;

  if v_count >= 5 then
    raise exception using errcode = 'P0001', message = 'STUDY_PLAN_MONTHLY_LIMIT';
  end if;

  update public.study_plans
  set status = 'replaced'
  where user_id = v_user_id
    and status = 'active';

  select coalesce(max(version), 0) + 1 into v_version
  from public.study_plans
  where user_id = v_user_id;

  -- Determine phase based on exam date
  v_phase := 'foundation';
  if p_goals ? 'examDate' and (p_goals->>'examDate') is not null then
    declare
      v_days integer;
    begin
      v_days := ((p_goals->>'examDate')::date - current_date);
      if v_days <= 7 then v_phase := 'sprint';
      elsif v_days <= 14 then v_phase := 'integrated';
      elsif v_days <= 28 then v_phase := 'focused';
      else v_phase := 'foundation';
      end if;
    end;
  end if;

  insert into public.study_plans (
    user_id, version, status, period_start, period_end,
    current_phase, diagnosis, preferences_snapshot, goals_snapshot, ai_model, generated_at
  ) values (
    v_user_id, v_version, 'active', p_period_start, p_period_end,
    v_phase, p_diagnosis, p_preferences, p_goals, p_ai_model, now()
  )
  returning id into v_new_plan_id;

  if p_tasks is not null and pg_catalog.jsonb_array_length(p_tasks) > 0 then
    for v_task in select * from pg_catalog.jsonb_array_elements(p_tasks)
    loop
      insert into public.study_plan_tasks (
        plan_id, user_id, scheduled_date, task_type, source,
        question_id, title, description, focus_criteria, focus_error_tags,
        estimated_minutes, difficulty, priority, generated_reason, writing_mode, status
      ) values (
        v_new_plan_id,
        v_user_id,
        (v_task->>'scheduledDate')::date,
        v_task->>'taskType',
        coalesce(v_task->>'source', 'built_in'),
        nullif(v_task->>'questionId', ''),
        coalesce(v_task->>'title', ''),
        coalesce(v_task->>'description', ''),
        case when v_task->'focusCriteria' is not null
          then array(select jsonb_array_elements_text(v_task->'focusCriteria'))
          else '{}'::text[] end,
        case when v_task->'focusErrorTags' is not null
          then array(select jsonb_array_elements_text(v_task->'focusErrorTags'))
          else '{}'::text[] end,
        coalesce((v_task->>'estimatedMinutes')::integer, 40),
        coalesce(v_task->>'difficulty', 'medium'),
        coalesce((v_task->>'priority')::integer, 2),
        coalesce(v_task->>'generatedReason', ''),
        v_task->>'writingMode',
        'pending'
      );
    end loop;
  end if;

  insert into public.study_plan_generation_events (
    user_id, plan_id, generated_at, month_key
  ) values (
    v_user_id, v_new_plan_id, now(), v_month_key
  );

  return pg_catalog.jsonb_build_object(
    'planId', v_new_plan_id,
    'version', v_version,
    'phase', v_phase,
    'monthKey', v_month_key,
    'usedCount', v_count + 1,
    'remainingCount', greatest(0, 5 - v_count - 1)
  );
end;
$$;

create or replace function public.generate_study_plan_slot(
  p_period_start date,
  p_period_end date,
  p_diagnosis jsonb,
  p_preferences jsonb,
  p_goals jsonb,
  p_ai_model text,
  p_tasks jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.generate_study_plan_slot(
    p_period_start, p_period_end, p_diagnosis, p_preferences, p_goals, p_ai_model, p_tasks
  );
$$;

revoke all on function private.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) from public;
grant execute on function private.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) to authenticated, service_role;

revoke all on function public.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) from public;
grant execute on function public.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) to authenticated, service_role;
