-- ============================================================
-- Analysis refresh job type and snapshot storage
-- ============================================================

-- Update job_type constraint to include analysis_refresh
ALTER TABLE public.study_plan_generation_jobs
  DROP CONSTRAINT IF EXISTS study_plan_generation_jobs_job_type_check;

ALTER TABLE public.study_plan_generation_jobs
  ADD CONSTRAINT study_plan_generation_jobs_job_type_check
  CHECK (job_type IN ('initial_generation', 'replan', 'analysis_refresh'));

-- Add analysis snapshot fields to study_plan_profiles
ALTER TABLE public.study_plan_profiles
  ADD COLUMN IF NOT EXISTS analysis_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS analysis_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS analysis_source_record_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analysis_latest_record_at timestamptz,
  ADD COLUMN IF NOT EXISTS analysis_refresh_job_id uuid;

COMMENT ON COLUMN public.study_plan_profiles.analysis_snapshot IS 'Cached analysis results: counts, scores, weaknesses, trends';
COMMENT ON COLUMN public.study_plan_profiles.analysis_updated_at IS 'When analysis was last refreshed';
COMMENT ON COLUMN public.study_plan_profiles.analysis_source_record_count IS 'Number of writing records used in last analysis';
COMMENT ON COLUMN public.study_plan_profiles.analysis_latest_record_at IS 'created_at of the newest writing record used in analysis';
COMMENT ON COLUMN public.study_plan_profiles.analysis_refresh_job_id IS 'ID of the most recent analysis_refresh job';
