-- ============================================================
-- Fix: background study plan save without auth.uid()
-- Run this in Supabase Dashboard SQL Editor
-- ============================================================

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
  v_version integer;
  v_new_plan_id uuid;
  v_task jsonb;
  v_phase text;
  v_days integer;
BEGIN
  SELECT * INTO v_job
  FROM public.study_plan_generation_jobs
  WHERE id = p_job_id AND user_id = p_user_id;

  IF v_job IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'JOB_NOT_FOUND';
  END IF;

  IF v_job.status NOT IN ('queued', 'analyzing_history', 'building_profile', 'generating_tasks', 'saving', 'failed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'JOB_INVALID_STATE';
  END IF;

  v_month_key := to_char(pg_catalog.timezone('Asia/Shanghai', now()), 'YYYY-MM');
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':study-plan-gen:' || v_month_key, 0)
  );

  UPDATE public.study_plans SET status = 'replaced' WHERE user_id = p_user_id AND status = 'active';

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version FROM public.study_plans WHERE user_id = p_user_id;

  v_phase := 'foundation';
  IF p_goals ? 'examDate' AND (p_goals->>'examDate') IS NOT NULL THEN
    v_days := ((p_goals->>'examDate')::date - CURRENT_DATE);
    IF v_days <= 7 THEN v_phase := 'sprint';
    ELSIF v_days <= 14 THEN v_phase := 'integrated';
    ELSIF v_days <= 28 THEN v_phase := 'focused';
    END IF;
  END IF;

  INSERT INTO public.study_plans (
    user_id, version, status, period_start, period_end,
    current_phase, diagnosis, preferences_snapshot, goals_snapshot, ai_model, generated_at
  ) VALUES (
    p_user_id, v_version, 'active', p_period_start, p_period_end,
    v_phase, p_diagnosis, p_preferences, p_goals, p_ai_model, now()
  ) RETURNING id INTO v_new_plan_id;

  IF p_tasks IS NOT NULL AND pg_catalog.jsonb_array_length(p_tasks) > 0 THEN
    FOR v_task IN SELECT * FROM pg_catalog.jsonb_array_elements(p_tasks)
    LOOP
      INSERT INTO public.study_plan_tasks (
        plan_id, user_id, scheduled_date, task_type, source,
        question_id, title, description, focus_criteria, focus_error_tags,
        estimated_minutes, difficulty, priority, generated_reason, writing_mode, status
      ) VALUES (
        v_new_plan_id, p_user_id,
        (v_task->>'scheduledDate')::date,
        v_task->>'taskType',
        COALESCE(v_task->>'source', 'built_in'),
        NULLIF(v_task->>'questionId', ''),
        COALESCE(v_task->>'title', ''),
        COALESCE(v_task->>'description', ''),
        CASE WHEN v_task->'focusCriteria' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(v_task->'focusCriteria')) ELSE '{}'::text[] END,
        CASE WHEN v_task->'focusErrorTags' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(v_task->'focusErrorTags')) ELSE '{}'::text[] END,
        COALESCE((v_task->>'estimatedMinutes')::integer, 40),
        COALESCE(v_task->>'difficulty', 'medium'),
        COALESCE((v_task->>'priority')::integer, 2),
        COALESCE(v_task->>'generatedReason', ''),
        v_task->>'writingMode',
        'pending'
      );
    END LOOP;
  END IF;

  INSERT INTO public.study_plan_generation_events (user_id, plan_id, generated_at, month_key)
  VALUES (p_user_id, v_new_plan_id, now(), v_month_key)
  ON CONFLICT DO NOTHING;

  UPDATE public.study_plan_generation_jobs
  SET status = 'completed', progress = 100, current_step = '完成',
      result_plan_id = v_new_plan_id, completed_at = now(), updated_at = now()
  WHERE id = p_job_id;

  RETURN pg_catalog.jsonb_build_object(
    'planId', v_new_plan_id, 'version', v_version, 'phase', v_phase,
    'taskCount', COALESCE(pg_catalog.jsonb_array_length(p_tasks), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.save_generated_study_plan(uuid, uuid, date, date, jsonb, jsonb, jsonb, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.save_generated_study_plan(uuid, uuid, date, date, jsonb, jsonb, jsonb, text, jsonb) TO service_role;
