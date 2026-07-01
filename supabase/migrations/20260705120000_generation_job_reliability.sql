-- ============================================================
-- Study plan generation job reliability improvements
-- Add heartbeat_at, job_type, timed_out detection, timeout
-- ============================================================

-- Add heartbeat_at column
ALTER TABLE public.study_plan_generation_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Add job_type column
ALTER TABLE public.study_plan_generation_jobs
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'initial_generation';

-- Add source_plan_id for replan jobs
ALTER TABLE public.study_plan_generation_jobs
  ADD COLUMN IF NOT EXISTS source_plan_id uuid;

-- Add failed_at column for clearer timeout tracking
ALTER TABLE public.study_plan_generation_jobs
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

-- Add cancelled_at column
ALTER TABLE public.study_plan_generation_jobs
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Add stage column (alias for current_step but more structured)
ALTER TABLE public.study_plan_generation_jobs
  ADD COLUMN IF NOT EXISTS stage text;

-- Add message column (human-readable status message)
ALTER TABLE public.study_plan_generation_jobs
  ADD COLUMN IF NOT EXISTS message text;

-- Update status constraint to include timed_out
DO $$
BEGIN
  -- Drop old constraint FIRST so we can update rows
  ALTER TABLE public.study_plan_generation_jobs
    DROP CONSTRAINT IF EXISTS study_plan_generation_jobs_status_check;
END $$;

-- Migrate old status values to new ones (old constraint is gone now)
UPDATE public.study_plan_generation_jobs
SET status = 'running'
WHERE status IN ('analyzing_history', 'building_profile', 'generating_tasks', 'saving');

-- Add new constraint
DO $$
BEGIN
  ALTER TABLE public.study_plan_generation_jobs
    ADD CONSTRAINT study_plan_generation_jobs_status_check
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add job_type constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_plan_generation_jobs_job_type_check'
      AND conrelid = 'public.study_plan_generation_jobs'::regclass
  ) THEN
    ALTER TABLE public.study_plan_generation_jobs
      ADD CONSTRAINT study_plan_generation_jobs_job_type_check
      CHECK (job_type IN ('initial_generation', 'replan'));
  END IF;
END $$;

-- Add progress constraint (0-100)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_plan_generation_jobs_progress_check'
      AND conrelid = 'public.study_plan_generation_jobs'::regclass
  ) THEN
    ALTER TABLE public.study_plan_generation_jobs
      ADD CONSTRAINT study_plan_generation_jobs_progress_check
      CHECK (progress >= 0 AND progress <= 100);
  END IF;
END $$;

-- Drop old active job index and recreate with new statuses
DROP INDEX IF EXISTS idx_study_plan_gen_jobs_active;

CREATE INDEX IF NOT EXISTS idx_study_plan_gen_jobs_active
  ON public.study_plan_generation_jobs(user_id, created_at DESC)
  WHERE status IN ('queued', 'running');

-- Index for heartbeat timeout detection
CREATE INDEX IF NOT EXISTS idx_study_plan_gen_jobs_heartbeat
  ON public.study_plan_generation_jobs(heartbeat_at)
  WHERE status = 'running';

-- Function to mark timed-out jobs (heartbeat stale > 15 minutes)
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
  UPDATE public.study_plan_generation_jobs
  SET status = 'timed_out',
      error_code = 'GENERATION_HEARTBEAT_TIMEOUT',
      error_message = 'Generation job timed out due to stale heartbeat',
      failed_at = now(),
      completed_at = now(),
      updated_at = now()
  WHERE status = 'running'
    AND heartbeat_at IS NOT NULL
    AND heartbeat_at < now() - interval '15 minutes';

  GET DIAGNOSTICS v_delta = ROW_COUNT;
  v_count := v_count + v_delta;

  -- Also handle jobs stuck in queued for > 5 minutes with no heartbeat
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

-- Function to get active job for a user with timeout detection
CREATE OR REPLACE FUNCTION public.get_active_generation_job(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  job_type text,
  status text,
  progress integer,
  stage text,
  message text,
  current_step text,
  heartbeat_at timestamptz,
  created_at timestamptz,
  result_plan_id uuid,
  error_code text,
  error_message text,
  attempt_count integer,
  started_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- First, mark any timed-out jobs
  PERFORM public.mark_timed_out_generation_jobs();

  -- Then return the active job (if any)
  RETURN QUERY
  SELECT
    g.id,
    g.job_type,
    g.status,
    g.progress,
    COALESCE(g.stage, g.current_step) as stage,
    COALESCE(g.message, g.current_step) as message,
    g.current_step,
    g.heartbeat_at,
    g.created_at,
    g.result_plan_id,
    g.error_code,
    g.error_message,
    g.attempt_count,
    g.started_at,
    g.completed_at
  FROM public.study_plan_generation_jobs g
  WHERE g.user_id = p_user_id
    AND g.status IN ('queued', 'running')
  ORDER BY g.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_generation_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_generation_job(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_active_generation_job(uuid) FROM anon;

COMMENT ON COLUMN public.study_plan_generation_jobs.heartbeat_at IS 'Last heartbeat timestamp; jobs with stale heartbeat (>15min) are marked timed_out';
COMMENT ON COLUMN public.study_plan_generation_jobs.job_type IS 'initial_generation or replan';
COMMENT ON COLUMN public.study_plan_generation_jobs.stage IS 'Structured stage identifier for current processing phase';
