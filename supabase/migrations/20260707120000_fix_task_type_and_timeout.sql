-- ============================================================
-- Fix task_type constraint violation and heartbeat timeout
-- ============================================================
-- This migration:
--   1. Fixes mark_timed_out_generation_jobs() to handle null heartbeat
--   2. Adds task_type normalization in save_generated_study_plan RPC
--   3. Cleans up stale running jobs with null heartbeat
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Fix mark_timed_out_generation_jobs to handle null heartbeat
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_timed_out_generation_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
  v_delta integer := 0;
BEGIN
  -- Pass 1: Running jobs with stale heartbeat (>15 minutes)
  -- NOW also handles NULL heartbeat by falling back to updated_at
  UPDATE public.study_plan_generation_jobs
  SET status = 'timed_out',
      error_code = 'GENERATION_HEARTBEAT_TIMEOUT',
      error_message = 'Generation job timed out due to stale heartbeat',
      failed_at = now(),
      completed_at = now(),
      updated_at = now()
  WHERE status = 'running'
    AND COALESCE(heartbeat_at, updated_at, created_at) < now() - interval '15 minutes';

  GET DIAGNOSTICS v_delta = ROW_COUNT;
  v_count := v_count + v_delta;

  -- Pass 2: Queued jobs stuck for >5 minutes with no heartbeat
  UPDATE public.study_plan_generation_jobs
  SET status = 'timed_out',
      error_code = 'GENERATION_QUEUE_TIMEOUT',
      error_message = 'Job stuck in queue too long',
      failed_at = now(),
      completed_at = now(),
      updated_at = now()
  WHERE status = 'queued'
    AND created_at < now() - interval '5 minutes'
    AND heartbeat_at IS NULL;

  GET DIAGNOSTICS v_delta = ROW_COUNT;
  v_count := v_count + v_delta;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_timed_out_generation_jobs() TO service_role;
REVOKE ALL ON FUNCTION public.mark_timed_out_generation_jobs() FROM public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Update save_generated_study_plan to normalize task_type
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.save_generated_study_plan(
  p_job_id uuid,
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_diagnosis jsonb,
  p_preferences jsonb,
  p_goals jsonb,
  p_ai_model text,
  p_tasks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.study_plan_generation_jobs%ROWTYPE;
  v_month_key text;
  v_count integer;
  v_version integer;
  v_new_plan_id uuid;
  v_task jsonb;
  v_phase text;
  v_days integer;
  v_task_type text;
BEGIN
  -- Validate job exists and belongs to user
  SELECT * INTO v_job
  FROM public.study_plan_generation_jobs
  WHERE id = p_job_id AND user_id = p_user_id;

  IF v_job IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'JOB_NOT_FOUND';
  END IF;

  IF v_job.status NOT IN ('queued', 'running', 'failed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'JOB_INVALID_STATE';
  END IF;

  -- Acquire advisory lock per user to prevent concurrent plan creation
  v_month_key := to_char(pg_catalog.timezone('Asia/Shanghai', now()), 'YYYY-MM');
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':study-plan-gen:' || v_month_key, 0)
  );

  -- Mark existing active plan as replaced
  UPDATE public.study_plans
  SET status = 'replaced'
  WHERE user_id = p_user_id AND status = 'active';

  -- Calculate next version
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.study_plans
  WHERE user_id = p_user_id;

  -- Determine phase based on exam date
  v_phase := 'foundation';
  IF p_goals ? 'examDate' AND (p_goals->>'examDate') IS NOT NULL THEN
    v_days := ((p_goals->>'examDate')::date - CURRENT_DATE);
    IF v_days <= 7 THEN v_phase := 'sprint';
    ELSIF v_days <= 14 THEN v_phase := 'integrated';
    ELSIF v_days <= 28 THEN v_phase := 'focused';
    END IF;
  END IF;

  -- Create the study plan
  INSERT INTO public.study_plans (
    user_id, version, status, period_start, period_end,
    current_phase, diagnosis, preferences_snapshot, goals_snapshot, ai_model, generated_at
  ) VALUES (
    p_user_id, v_version, 'active', p_period_start, p_period_end,
    v_phase, p_diagnosis, p_preferences, p_goals, p_ai_model, now()
  )
  RETURNING id INTO v_new_plan_id;

  -- Insert tasks with normalized task_type
  IF p_tasks IS NOT NULL AND pg_catalog.jsonb_array_length(p_tasks) > 0 THEN
    FOR v_task IN SELECT * FROM pg_catalog.jsonb_array_elements(p_tasks)
    LOOP
      -- Normalize task_type to valid DB values
      v_task_type := CASE lower(trim(v_task->>'taskType'))
        WHEN 'task1' THEN 'task1'
        WHEN 'task_1' THEN 'task1'
        WHEN 'ielts_task1' THEN 'task1'
        WHEN 'academic_task1' THEN 'task1'
        WHEN 'timed_practice' THEN 'task1'
        WHEN 'task2' THEN 'task2'
        WHEN 'task_2' THEN 'task2'
        WHEN 'ielts_task2' THEN 'task2'
        WHEN 'diagnostic' THEN 'task2'
        WHEN 'full_test' THEN 'full_test'
        WHEN 'mock_test' THEN 'full_test'
        WHEN 'full_mock' THEN 'full_test'
        WHEN 'complete_test' THEN 'full_test'
        WHEN 'grammar_drill' THEN 'grammar_drill'
        WHEN 'grammar' THEN 'grammar_drill'
        WHEN 'grammar_practice' THEN 'grammar_drill'
        WHEN 'vocabulary_drill' THEN 'vocabulary_drill'
        WHEN 'vocabulary' THEN 'vocabulary_drill'
        WHEN 'vocab' THEN 'vocabulary_drill'
        WHEN 'vocabulary_practice' THEN 'vocabulary_drill'
        WHEN 'review' THEN 'review'
        WHEN 'revision' THEN 'review'
        WHEN 'error_review' THEN 'review'
        WHEN 'model_answer_review' THEN 'review'
        ELSE 'review'
      END;

      INSERT INTO public.study_plan_tasks (
        plan_id, user_id, scheduled_date, task_type, source,
        question_id, title, description, focus_criteria, focus_error_tags,
        estimated_minutes, difficulty, priority, generated_reason, writing_mode, status,
        question_source, original_question_source, fallback_reason
      ) VALUES (
        v_new_plan_id,
        p_user_id,
        (v_task->>'scheduledDate')::date,
        v_task_type,
        COALESCE(v_task->>'source', 'built_in'),
        NULLIF(v_task->>'questionId', ''),
        COALESCE(v_task->>'title', ''),
        COALESCE(v_task->>'description', ''),
        CASE WHEN v_task->'focusCriteria' IS NOT NULL
          THEN ARRAY(SELECT jsonb_array_elements_text(v_task->'focusCriteria'))
          ELSE '{}'::text[] END,
        CASE WHEN v_task->'focusErrorTags' IS NOT NULL
          THEN ARRAY(SELECT jsonb_array_elements_text(v_task->'focusErrorTags'))
          ELSE '{}'::text[] END,
        COALESCE((v_task->>'estimatedMinutes')::integer, 40),
        COALESCE(v_task->>'difficulty', 'medium'),
        COALESCE((v_task->>'priority')::integer, 2),
        COALESCE(v_task->>'generatedReason', ''),
        v_task->>'writingMode',
        'pending',
        COALESCE(v_task->>'questionSource', 'question_bank'),
        v_task->>'originalQuestionSource',
        v_task->>'fallbackReason'
      );
    END LOOP;
  END IF;

  -- Record generation event (for monthly limit tracking)
  INSERT INTO public.study_plan_generation_events (user_id, plan_id, generated_at, month_key)
  VALUES (p_user_id, v_new_plan_id, now(), v_month_key)
  ON CONFLICT DO NOTHING;

  -- Update job to completed
  UPDATE public.study_plan_generation_jobs
  SET status = 'completed',
      progress = 100,
      current_step = '完成',
      stage = 'completed',
      message = '学习计划已生成',
      result_plan_id = v_new_plan_id,
      completed_at = now(),
      updated_at = now(),
      heartbeat_at = now()
  WHERE id = p_job_id;

  RETURN pg_catalog.jsonb_build_object(
    'planId', v_new_plan_id,
    'version', v_version,
    'phase', v_phase,
    'taskCount', COALESCE(pg_catalog.jsonb_array_length(p_tasks), 0)
  );
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION private.save_generated_study_plan(uuid, uuid, date, date, jsonb, jsonb, jsonb, text, jsonb) TO service_role;
