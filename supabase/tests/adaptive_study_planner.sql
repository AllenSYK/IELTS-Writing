begin;

do $test$
declare
  u uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  job uuid := gen_random_uuid();
  lease uuid := gen_random_uuid();
  v_plan_id uuid;
  result jsonb;
  generated jsonb;
  seed jsonb := '{
    "scheduledDate":"2027-01-05","taskType":"task2","source":"past_paper",
    "title":"Task 2 fixture","description":"Practice","focusCriteria":["taskResponse"],
    "focusErrorTags":[],"estimatedMinutes":40,"difficulty":"medium","priority":1,
    "generatedReason":"Fixture","writingMode":"task2","questionId":"fixture",
    "questionSource":"question_bank","originalQuestionSource":"ai_generated","fallbackReason":"AI_GENERATION_FAILED",
    "assignedQuestions":{"task2":{"actual":"question_bank","expected":"ai_generated","question":{"id":"fixture"}}},
    "reason":{"phase":"focused","focusTask":"task2","kind":"writing"}
  }';
begin
  insert into auth.users(id, aud, role, email) values
    (u, 'authenticated', 'authenticated', u || '@example.invalid'),
    (other_user, 'authenticated', 'authenticated', other_user || '@example.invalid');
  insert into public.study_plan_generation_jobs(id, user_id, job_type, status)
    values (job, u, 'initial_generation', 'queued');
  begin
    insert into public.study_plan_generation_jobs(user_id, job_type, status)
      values (u, 'initial_generation', 'queued');
    raise exception 'duplicate active planner job accepted';
  exception when raise_exception then
    if sqlerrm <> 'STUDY_PLAN_JOB_ALREADY_ACTIVE' then raise; end if;
  end;
  update public.study_plan_generation_jobs set status = 'running' where id = job;

  if has_function_privilege('authenticated', 'public.commit_adaptive_study_plan(uuid,uuid,uuid,text,date,date,date,jsonb,jsonb,jsonb,text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.save_adaptive_study_plan(uuid,uuid,date,date,date,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'adaptive save functions must be private to the service';
  end if;

  execute 'set local role service_role';
  generated := public.save_adaptive_study_plan(job, u, '2027-01-01', '2027-02-01', '2027-01-07',
    '{}', '{}', '{}', jsonb_build_array(seed));
  v_plan_id := (generated->>'planId')::uuid;
  result := public.save_adaptive_study_plan(job, u, '2027-01-01', '2027-02-01', '2027-01-07',
    '{}', '{}', '{}', jsonb_build_array(seed));
  if result->>'planId' is distinct from v_plan_id::text
    or (select count(*) from public.study_plan_tasks t where t.plan_id = v_plan_id) <> 1 then
    raise exception 'repeat save was not idempotent';
  end if;
  if not exists (select 1 from public.study_plan_tasks t where t.plan_id = v_plan_id and
    t.assigned_questions->'task2'->>'expected' = 'ai_generated' and t.question_source = 'question_bank') then
    raise exception 'assigned question or source metadata was not saved';
  end if;

  perform private.insert_adaptive_training(v_plan_id, u, jsonb_build_array(
    seed || '{"scheduledDate":"2027-01-03","title":"completed"}',
    seed || '{"scheduledDate":"2027-01-04","title":"started"}',
    seed || '{"scheduledDate":"2027-01-06","title":"locked"}'));
  update public.study_plan_tasks t set status = 'completed' where t.plan_id = v_plan_id and title = 'completed';
  update public.study_plan_tasks t set status = 'in_progress' where t.plan_id = v_plan_id and title = 'started';
  update public.study_plan_tasks t set is_locked = true where t.plan_id = v_plan_id and title = 'locked';
  update public.study_plans set adaptation_lease = lease, adaptation_started_at = now() where id = v_plan_id;

  if public.commit_adaptive_study_plan(v_plan_id, other_user, lease, 'other', '2027-01-02', '2027-01-08', '2027-02-01',
      '{}', '{}', '{}', 'bad caller', '[]') then
    raise exception 'other user modified plan';
  end if;
  if not public.commit_adaptive_study_plan(v_plan_id, u, lease, 'first', '2027-01-02', '2027-01-08', '2027-02-01',
      '{"task2Average":6.5}', '{}', '{}', 'new feedback', jsonb_build_array(
        seed || '{"scheduledDate":"2027-01-03","title":"do not overwrite"}',
        seed || '{"scheduledDate":"2027-01-04","title":"do not overwrite"}',
        seed || '{"scheduledDate":"2027-01-06","title":"do not overwrite"}',
        seed || '{"scheduledDate":"2027-01-08","title":"adapted"}')) then
    raise exception 'adaptation was not saved';
  end if;
  if public.commit_adaptive_study_plan(v_plan_id, u, lease, 'first', '2027-01-02', '2027-01-08', '2027-02-01',
      '{}', '{}', '{}', 'replayed', '[]') then
    raise exception 'stale lease was accepted';
  end if;
  if (select array_agg(title order by scheduled_date) from public.study_plan_tasks t where t.plan_id = v_plan_id)
      is distinct from array['completed', 'started', 'locked', 'adapted'] then
    raise exception 'adaptation overwrote protected tasks or left stale tasks';
  end if;
  if (select count(*) from public.study_plan_generation_events where user_id = u) <> 1 then
    raise exception 'adaptation changed generation accounting';
  end if;
  if not exists (select 1 from public.study_plans where id = v_plan_id and diagnosis->>'task2Average' = '6.5') then
    raise exception 'diagnosis did not update with adaptation';
  end if;
  execute 'reset role';
end
$test$;

rollback;
