-- ============================================================
-- Reconcile study plan schema: safe补齐 + RPC fix + idempotency
-- ============================================================
-- This migration:
--   1. Safely adds columns from 20260629120000_enhance_study_plans (IF NOT EXISTS)
--   2. Fixes complete_study_plan_task RPC parameter type (text → uuid)
--   3. Adds true idempotency to complete_study_plan_task
--   4. Adds is_locked column for task locking
--   5. Creates error notebook tables
--   6. Creates rewrite tracking fields
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Safe schema补齐 for study plan tables
-- ──────────────────────────────────────────────────────────────

-- study_plan_tasks: add columns if not exists
ALTER TABLE public.study_plan_tasks
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS generated_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS writing_mode text,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- Add difficulty check constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_plan_tasks_difficulty_check'
      AND conrelid = 'public.study_plan_tasks'::regclass
  ) THEN
    ALTER TABLE public.study_plan_tasks
      ADD CONSTRAINT study_plan_tasks_difficulty_check
      CHECK (difficulty IN ('easy', 'medium', 'hard'));
  END IF;
END $$;

-- Add priority check constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_plan_tasks_priority_check'
      AND conrelid = 'public.study_plan_tasks'::regclass
  ) THEN
    ALTER TABLE public.study_plan_tasks
      ADD CONSTRAINT study_plan_tasks_priority_check
      CHECK (priority >= 1 AND priority <= 3);
  END IF;
END $$;

-- Update status constraint to include 'rescheduled'
ALTER TABLE public.study_plan_tasks DROP CONSTRAINT IF EXISTS study_plan_tasks_status_check;
ALTER TABLE public.study_plan_tasks
  ADD CONSTRAINT study_plan_tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'rescheduled'));

-- study_plans: add current_phase if not exists
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS current_phase text NOT NULL DEFAULT 'foundation';

-- study_plan_profiles: add columns if not exists
ALTER TABLE public.study_plan_profiles
  ADD COLUMN IF NOT EXISTS intensity text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS allow_timed_practice boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS current_level numeric(2,1);

-- Add intensity check constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_plan_profiles_intensity_check'
      AND conrelid = 'public.study_plan_profiles'::regclass
  ) THEN
    ALTER TABLE public.study_plan_profiles
      ADD CONSTRAINT study_plan_profiles_intensity_check
      CHECK (intensity IN ('relaxed', 'standard', 'intensive'));
  END IF;
END $$;

-- Add indexes if not exists
CREATE INDEX IF NOT EXISTS idx_study_plan_tasks_user_type_date
  ON public.study_plan_tasks(user_id, task_type, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_study_plan_tasks_plan_status
  ON public.study_plan_tasks(plan_id, status);

CREATE INDEX IF NOT EXISTS idx_study_plan_tasks_locked
  ON public.study_plan_tasks(user_id, is_locked) WHERE is_locked = true;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Fix complete_study_plan_task RPC with proper idempotency
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.complete_study_plan_task(
  p_task_id uuid,
  p_writing_record_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_task public.study_plan_tasks%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_ACCESS_DENIED';
  END IF;

  -- Lock the row to prevent concurrent completion
  SELECT * INTO v_task
  FROM public.study_plan_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  -- Task not found
  IF v_task IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_TASK_NOT_FOUND';
  END IF;

  -- Access denied: task belongs to another user
  IF v_task.user_id != v_user_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_ACCESS_DENIED';
  END IF;

  -- Idempotent: already completed with same writing_record_id
  IF v_task.status = 'completed' AND v_task.writing_record_id = p_writing_record_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'taskId', v_task.id,
      'status', 'completed',
      'completedAt', v_task.completed_at,
      'idempotent', true
    );
  END IF;

  -- Conflict: already completed with different writing_record_id
  IF v_task.status = 'completed' AND v_task.writing_record_id IS NOT NULL
     AND v_task.writing_record_id != p_writing_record_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_TASK_ALREADY_LINKED';
  END IF;

  -- Invalid state transition
  IF v_task.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_TASK_INVALID_STATE';
  END IF;

  -- Perform the completion
  UPDATE public.study_plan_tasks
  SET status = 'completed',
      writing_record_id = p_writing_record_id,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  RETURN pg_catalog.jsonb_build_object(
    'taskId', v_task.id,
    'status', 'completed',
    'completedAt', v_task.completed_at,
    'idempotent', false
  );
END;
$$;

-- Public wrapper (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.complete_study_plan_task(
  p_task_id uuid,
  p_writing_record_id uuid
)
RETURNS jsonb
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.complete_study_plan_task(p_task_id, p_writing_record_id);
$$;

-- Revoke from public, grant to authenticated and service_role
REVOKE ALL ON FUNCTION private.complete_study_plan_task(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION private.complete_study_plan_task(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_study_plan_task(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_study_plan_task(uuid, uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Update generate_study_plan_slot to handle is_locked
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.generate_study_plan_slot(
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
  v_user_id uuid := auth.uid();
  v_month_key text;
  v_count integer;
  v_version integer;
  v_new_plan_id uuid;
  v_task jsonb;
  v_phase text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_ACCESS_DENIED';
  END IF;

  v_month_key := to_char(pg_catalog.timezone('Asia/Shanghai', now()), 'YYYY-MM');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':study-plan-gen:' || v_month_key, 0)
  );

  SELECT count(*) INTO v_count
  FROM public.study_plan_generation_events
  WHERE user_id = v_user_id
    AND month_key = v_month_key;

  IF v_count >= 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_MONTHLY_LIMIT';
  END IF;

  UPDATE public.study_plans
  SET status = 'replaced'
  WHERE user_id = v_user_id
    AND status = 'active';

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.study_plans
  WHERE user_id = v_user_id;

  -- Determine phase based on exam date
  v_phase := 'foundation';
  IF p_goals ? 'examDate' AND (p_goals->>'examDate') IS NOT NULL THEN
    DECLARE
      v_days integer;
    BEGIN
      v_days := ((p_goals->>'examDate')::date - current_date);
      IF v_days <= 7 THEN v_phase := 'sprint';
      ELSIF v_days <= 14 THEN v_phase := 'integrated';
      ELSIF v_days <= 28 THEN v_phase := 'focused';
      ELSE v_phase := 'foundation';
      END IF;
    END;
  END IF;

  INSERT INTO public.study_plans (
    user_id, version, status, period_start, period_end,
    current_phase, diagnosis, preferences_snapshot, goals_snapshot, ai_model, generated_at
  ) VALUES (
    v_user_id, v_version, 'active', p_period_start, p_period_end,
    v_phase, p_diagnosis, p_preferences, p_goals, p_ai_model, now()
  )
  RETURNING id INTO v_new_plan_id;

  IF p_tasks IS NOT NULL AND pg_catalog.jsonb_array_length(p_tasks) > 0 THEN
    FOR v_task IN SELECT * FROM pg_catalog.jsonb_array_elements(p_tasks)
    LOOP
      INSERT INTO public.study_plan_tasks (
        plan_id, user_id, scheduled_date, task_type, source,
        question_id, title, description, focus_criteria, focus_error_tags,
        estimated_minutes, difficulty, priority, generated_reason, writing_mode, status
      ) VALUES (
        v_new_plan_id,
        v_user_id,
        (v_task->>'scheduledDate')::date,
        v_task->>'taskType',
        coalesce(v_task->>'source', 'built_in'),
        nullif(v_task->>'questionId', ''),
        coalesce(v_task->>'title', ''),
        coalesce(v_task->>'description', ''),
        CASE WHEN v_task->'focusCriteria' IS NOT NULL
          THEN ARRAY(SELECT jsonb_array_elements_text(v_task->'focusCriteria'))
          ELSE '{}'::text[] END,
        CASE WHEN v_task->'focusErrorTags' IS NOT NULL
          THEN ARRAY(SELECT jsonb_array_elements_text(v_task->'focusErrorTags'))
          ELSE '{}'::text[] END,
        coalesce((v_task->>'estimatedMinutes')::integer, 40),
        coalesce(v_task->>'difficulty', 'medium'),
        coalesce((v_task->>'priority')::integer, 2),
        coalesce(v_task->>'generatedReason', ''),
        v_task->>'writingMode',
        'pending'
      );
    END LOOP;
  END IF;

  INSERT INTO public.study_plan_generation_events (
    user_id, plan_id, generated_at, month_key
  ) VALUES (
    v_user_id, v_new_plan_id, now(), v_month_key
  );

  RETURN pg_catalog.jsonb_build_object(
    'planId', v_new_plan_id,
    'version', v_version,
    'phase', v_phase,
    'monthKey', v_month_key,
    'usedCount', v_count + 1,
    'remainingCount', greatest(0, 5 - v_count - 1)
  );
END;
$$;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.generate_study_plan_slot(
  p_period_start date,
  p_period_end date,
  p_diagnosis jsonb,
  p_preferences jsonb,
  p_goals jsonb,
  p_ai_model text,
  p_tasks jsonb
)
RETURNS jsonb
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.generate_study_plan_slot(
    p_period_start, p_period_end, p_diagnosis, p_preferences, p_goals, p_ai_model, p_tasks
  );
$$;

REVOKE ALL ON FUNCTION private.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION private.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────
-- STEP 4: Create error notebook tables
-- ──────────────────────────────────────────────────────────────

-- Error pattern aggregation table
CREATE TABLE IF NOT EXISTS public.writing_error_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  subcategory text,
  normalized_key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  example_wrong text,
  example_correct text,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  mastery_level numeric(3,2) NOT NULL DEFAULT 0.00,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add status check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'writing_error_patterns_status_check'
      AND conrelid = 'public.writing_error_patterns'::regclass
  ) THEN
    ALTER TABLE public.writing_error_patterns
      ADD CONSTRAINT writing_error_patterns_status_check
      CHECK (status IN ('active', 'improving', 'mastered', 'archived'));
  END IF;
END $$;

-- Unique constraint on user + normalized_key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'writing_error_patterns_user_key_unique'
      AND conrelid = 'public.writing_error_patterns'::regclass
  ) THEN
    ALTER TABLE public.writing_error_patterns
      ADD CONSTRAINT writing_error_patterns_user_key_unique
      UNIQUE (user_id, normalized_key);
  END IF;
END $$;

-- Error occurrence details
CREATE TABLE IF NOT EXISTS public.writing_error_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_pattern_id uuid NOT NULL REFERENCES public.writing_error_patterns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  writing_record_id uuid NOT NULL REFERENCES public.writing_records(id) ON DELETE CASCADE,
  sentence_excerpt text,
  correction text,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Error review history
CREATE TABLE IF NOT EXISTS public.writing_error_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_pattern_id uuid NOT NULL REFERENCES public.writing_error_patterns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_type text NOT NULL DEFAULT 'rewrite',
  result text NOT NULL DEFAULT 'attempted',
  score numeric(3,2),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

-- Add review type check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'writing_error_reviews_review_type_check'
      AND conrelid = 'public.writing_error_reviews'::regclass
  ) THEN
    ALTER TABLE public.writing_error_reviews
      ADD CONSTRAINT writing_error_reviews_review_type_check
      CHECK (review_type IN ('rewrite', 'fill_blank', 'identify', 'explain', 'multiple_choice'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'writing_error_reviews_result_check'
      AND conrelid = 'public.writing_error_reviews'::regclass
  ) THEN
    ALTER TABLE public.writing_error_reviews
      ADD CONSTRAINT writing_error_reviews_result_check
      CHECK (result IN ('correct', 'partial', 'incorrect', 'attempted'));
  END IF;
END $$;

-- Indexes for error patterns
CREATE INDEX IF NOT EXISTS idx_writing_error_patterns_user
  ON public.writing_error_patterns(user_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_writing_error_patterns_category
  ON public.writing_error_patterns(user_id, category);

CREATE INDEX IF NOT EXISTS idx_writing_error_patterns_mastery
  ON public.writing_error_patterns(user_id, mastery_level);

-- Indexes for occurrences
CREATE INDEX IF NOT EXISTS idx_writing_error_occurrences_pattern
  ON public.writing_error_occurrences(error_pattern_id);

CREATE INDEX IF NOT EXISTS idx_writing_error_occurrences_user
  ON public.writing_error_occurrences(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_writing_error_occurrences_record
  ON public.writing_error_occurrences(writing_record_id);

-- Indexes for reviews
CREATE INDEX IF NOT EXISTS idx_writing_error_reviews_pattern
  ON public.writing_error_reviews(error_pattern_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_writing_error_reviews_user
  ON public.writing_error_reviews(user_id, reviewed_at DESC);

-- RLS for error patterns
ALTER TABLE public.writing_error_patterns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'writing_error_patterns_select_own'
      AND tablename = 'writing_error_patterns'
  ) THEN
    CREATE POLICY writing_error_patterns_select_own
      ON public.writing_error_patterns FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'writing_error_patterns_insert_own'
      AND tablename = 'writing_error_patterns'
  ) THEN
    CREATE POLICY writing_error_patterns_insert_own
      ON public.writing_error_patterns FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'writing_error_patterns_update_own'
      AND tablename = 'writing_error_patterns'
  ) THEN
    CREATE POLICY writing_error_patterns_update_own
      ON public.writing_error_patterns FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- RLS for occurrences
ALTER TABLE public.writing_error_occurrences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'writing_error_occurrences_select_own'
      AND tablename = 'writing_error_occurrences'
  ) THEN
    CREATE POLICY writing_error_occurrences_select_own
      ON public.writing_error_occurrences FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'writing_error_occurrences_insert_own'
      AND tablename = 'writing_error_occurrences'
  ) THEN
    CREATE POLICY writing_error_occurrences_insert_own
      ON public.writing_error_occurrences FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- RLS for reviews
ALTER TABLE public.writing_error_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'writing_error_reviews_select_own'
      AND tablename = 'writing_error_reviews'
  ) THEN
    CREATE POLICY writing_error_reviews_select_own
      ON public.writing_error_reviews FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'writing_error_reviews_insert_own'
      AND tablename = 'writing_error_reviews'
  ) THEN
    CREATE POLICY writing_error_reviews_insert_own
      ON public.writing_error_reviews FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Grants for error tables
GRANT SELECT, INSERT, UPDATE ON public.writing_error_patterns TO authenticated;
GRANT ALL ON public.writing_error_patterns TO service_role;

GRANT SELECT, INSERT ON public.writing_error_occurrences TO authenticated;
GRANT ALL ON public.writing_error_occurrences TO service_role;

GRANT SELECT, INSERT ON public.writing_error_reviews TO authenticated;
GRANT ALL ON public.writing_error_reviews TO service_role;

-- Revoke anon access
REVOKE ALL ON public.writing_error_patterns FROM anon;
REVOKE ALL ON public.writing_error_occurrences FROM anon;
REVOKE ALL ON public.writing_error_reviews FROM anon;

-- ──────────────────────────────────────────────────────────────
-- STEP 5: Add revision tracking to writing_records
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.writing_records
  ADD COLUMN IF NOT EXISTS revision_of_record_id uuid REFERENCES public.writing_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_reason text;

CREATE INDEX IF NOT EXISTS idx_writing_records_revision_of
  ON public.writing_records(revision_of_record_id)
  WHERE revision_of_record_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- STEP 6: RPC for rebalancing study plan tasks
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.rebalance_study_plan_tasks(
  p_task_ids uuid[],
  p_new_dates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_task_id uuid;
  v_new_date text;
  v_moved_count integer := 0;
  v_task public.study_plan_tasks%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_ACCESS_DENIED';
  END IF;

  -- Validate all tasks belong to user and are not locked/completed
  FOR v_task_id IN SELECT * FROM unnest(p_task_ids)
  LOOP
    SELECT * INTO v_task
    FROM public.study_plan_tasks
    WHERE id = v_task_id AND user_id = v_user_id;

    IF v_task IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_TASK_NOT_FOUND';
    END IF;

    IF v_task.is_locked THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_TASK_LOCKED';
    END IF;

    IF v_task.status = 'completed' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDY_PLAN_TASK_ALREADY_COMPLETED';
    END IF;
  END LOOP;

  -- Apply new dates
  FOR i IN 1..array_length(p_task_ids, 1)
  LOOP
    v_new_date := p_new_dates->>(i - 1)::text;
    IF v_new_date IS NOT NULL THEN
      UPDATE public.study_plan_tasks
      SET scheduled_date = v_new_date::date,
          status = CASE
            WHEN status = 'rescheduled' THEN 'pending'
            ELSE status
          END,
          updated_at = now()
      WHERE id = p_task_ids[i]
        AND user_id = v_user_id
        AND NOT is_locked
        AND status NOT IN ('completed');
      v_moved_count := v_moved_count + 1;
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'movedCount', v_moved_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rebalance_study_plan_tasks(
  p_task_ids uuid[],
  p_new_dates jsonb
)
RETURNS jsonb
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.rebalance_study_plan_tasks(p_task_ids, p_new_dates);
$$;

REVOKE ALL ON FUNCTION private.rebalance_study_plan_tasks(uuid[], jsonb) FROM public;
GRANT EXECUTE ON FUNCTION private.rebalance_study_plan_tasks(uuid[], jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rebalance_study_plan_tasks(uuid[], jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.rebalance_study_plan_tasks(uuid[], jsonb) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────
-- STEP 7: Add comments for documentation
-- ──────────────────────────────────────────────────────────────

COMMENT ON TABLE public.writing_error_patterns IS 'Aggregated error patterns per user, deduplicated by normalized_key';
COMMENT ON TABLE public.writing_error_occurrences IS 'Individual error occurrences linked to specific writing records';
COMMENT ON TABLE public.writing_error_reviews IS 'User review history for error patterns, tracking mastery progression';
COMMENT ON COLUMN public.study_plan_tasks.is_locked IS 'Whether this task is locked and cannot be moved by rebalancing';
COMMENT ON COLUMN public.writing_records.revision_of_record_id IS 'If this is a rewrite, the original record it was based on';
COMMENT ON COLUMN public.writing_records.revision_number IS 'Version number for rewrites (1 = original)';
