alter table public.study_plan_tasks
  add column assigned_questions jsonb not null default '{}'::jsonb,
  add column training_reason jsonb,
  add column exercise_response text;

alter table public.study_plans
  add column adaptive_through date,
  add column adaptation_key text,
  add column adaptation_lease uuid,
  add column adaptation_started_at timestamptz,
  add column adaptation_reason text,
  add column adaptation_applied_at timestamptz;

create index study_plan_tasks_adaptive_activity_idx on public.study_plan_tasks (plan_id, updated_at)
  where status in ('completed', 'skipped');

alter table public.study_plan_profiles
  add column planner_options jsonb not null default '{}'::jsonb;

-- A shared insert path keeps the initial week and later rolling weeks in the same format.
create function private.insert_adaptive_training(
  p_plan_id uuid, p_user_id uuid, p_tasks jsonb
) returns void
language sql security invoker set search_path = ''
as $$
  insert into public.study_plan_tasks (
    plan_id, user_id, scheduled_date, task_type, source, title, description,
    focus_criteria, focus_error_tags, estimated_minutes, difficulty, priority, generated_reason,
    writing_mode, question_id, question_source, original_question_source, fallback_reason,
    assigned_questions, training_reason
  )
  select p_plan_id, p_user_id, (t->>'scheduledDate')::date, t->>'taskType', t->>'source',
    t->>'title', t->>'description',
    array(select jsonb_array_elements_text(t->'focusCriteria')),
    array(select jsonb_array_elements_text(t->'focusErrorTags')),
    (t->>'estimatedMinutes')::integer, t->>'difficulty', (t->>'priority')::integer,
    t->>'generatedReason', t->>'writingMode', t->>'questionId', t->>'questionSource',
    t->>'originalQuestionSource', t->>'fallbackReason', t->'assignedQuestions', t->'reason'
  from jsonb_array_elements(p_tasks) t;
$$;

revoke all on function private.insert_adaptive_training(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.insert_adaptive_training(uuid, uuid, jsonb) to service_role;

create function public.save_adaptive_study_plan(
  p_job_id uuid, p_user_id uuid, p_period_start date, p_period_end date, p_through date,
  p_diagnosis jsonb, p_preferences jsonb, p_goals jsonb, p_tasks jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_result jsonb;
  v_job public.study_plan_generation_jobs%rowtype;
  v_plan_id uuid;
begin
  select * into v_job from public.study_plan_generation_jobs
  where id = p_job_id and user_id = p_user_id for update;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.status = 'completed' and v_job.result_plan_id is not null then
    return jsonb_build_object('planId', v_job.result_plan_id);
  end if;
  if v_job.status <> 'running' then raise exception 'JOB_INVALID_STATE'; end if;
  if v_job.job_type = 'initial_generation' and exists (
    select 1 from public.study_plans where user_id = p_user_id and status = 'active'
  ) then raise exception 'JOB_INVALID_STATE'; end if;
  if v_job.job_type = 'replan' and not exists (
    select 1 from public.study_plans where id = v_job.source_plan_id and user_id = p_user_id and status = 'active'
  ) then raise exception 'JOB_INVALID_STATE'; end if;

  -- Preserve the established generation transaction, history and quota accounting.
  v_result := private.save_generated_study_plan(
    p_job_id, p_user_id, p_period_start, p_period_end,
    p_diagnosis, p_preferences, p_goals, 'adaptive_v1', '[]'::jsonb
  );
  v_plan_id := (v_result->>'planId')::uuid;
  perform private.insert_adaptive_training(v_plan_id, p_user_id, p_tasks);
  update public.study_plans
    set adaptive_through = p_through, adaptation_applied_at = now(),
        current_phase = coalesce(p_tasks->0->'reason'->>'phase', current_phase)
    where id = v_plan_id;
  return v_result || jsonb_build_object('taskCount', jsonb_array_length(p_tasks));
end;
$$;

revoke all on function public.save_adaptive_study_plan(uuid, uuid, date, date, date, jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.save_adaptive_study_plan(uuid, uuid, date, date, date, jsonb, jsonb, jsonb, jsonb)
to service_role;

create function public.commit_adaptive_study_plan(
  p_plan_id uuid, p_user_id uuid, p_lease uuid, p_key text, p_start date, p_through date,
  p_period_end date, p_diagnosis jsonb, p_preferences jsonb, p_goals jsonb,
  p_reason text, p_tasks jsonb
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_started timestamptz;
  v_blocked date[];
begin
  select adaptation_started_at into v_started from public.study_plans
    where id = p_plan_id and user_id = p_user_id and status = 'active'
      and adaptation_lease = p_lease
    for update;
  if not found then return false; end if;

  perform 1 from public.study_plan_tasks
    where plan_id = p_plan_id and user_id = p_user_id and scheduled_date >= p_start
    order by id for update;

  select coalesce(array_agg(distinct scheduled_date), '{}'::date[]) into v_blocked
    from public.study_plan_tasks
    where plan_id = p_plan_id and user_id = p_user_id and scheduled_date >= p_start
      and (status <> 'pending' or is_locked or started_at is not null or draft_id is not null or updated_at > v_started);

  delete from public.study_plan_tasks
    where plan_id = p_plan_id and user_id = p_user_id and scheduled_date >= p_start
      and scheduled_date <> all(v_blocked)
      and status = 'pending' and not is_locked and started_at is null and draft_id is null;

  perform private.insert_adaptive_training(p_plan_id, p_user_id,
    coalesce((select jsonb_agg(t) from jsonb_array_elements(p_tasks) t
      where (t->>'scheduledDate')::date between p_start and p_through
        and (t->>'scheduledDate')::date <> all(v_blocked)), '[]'::jsonb));

  update public.study_plans set adaptive_through = p_through, period_end = p_period_end,
    diagnosis = p_diagnosis, preferences_snapshot = p_preferences, goals_snapshot = p_goals,
    current_phase = coalesce(p_tasks->0->'reason'->>'phase', current_phase),
    adaptation_key = p_key, adaptation_reason = p_reason, adaptation_applied_at = v_started,
    adaptation_lease = null, adaptation_started_at = null
  where id = p_plan_id;
  return true;
end;
$$;

revoke all on function public.commit_adaptive_study_plan(uuid, uuid, uuid, text, date, date, date, jsonb, jsonb, jsonb, text, jsonb)
from public, anon, authenticated;
grant execute on function public.commit_adaptive_study_plan(uuid, uuid, uuid, text, date, date, date, jsonb, jsonb, jsonb, text, jsonb)
to service_role;

-- One running planner job per user. The existing monthly quota trigger remains in force.
create function private.guard_active_planner_job()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.job_type not in ('initial_generation', 'replan') or new.status <> 'queued'
    or (tg_op = 'UPDATE' and old.status = 'queued') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':adaptive-planner-job', 0));
  if exists (select 1 from public.study_plan_generation_jobs
    where user_id = new.user_id and id <> new.id
      and job_type in ('initial_generation', 'replan') and status in ('queued', 'running')) then
    raise exception 'STUDY_PLAN_JOB_ALREADY_ACTIVE';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_active_planner_job() from public, anon, authenticated;
create trigger trg_guard_active_planner_job
before insert or update of status on public.study_plan_generation_jobs
for each row execute function private.guard_active_planner_job();
