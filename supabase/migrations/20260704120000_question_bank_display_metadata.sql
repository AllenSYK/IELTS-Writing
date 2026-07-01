-- Add display metadata fields to past_paper_questions for randomized browsing
-- These fields support: randomized sort order, display dates, exam session labels, frequency scores

-- 0. Ensure is_visible column exists (from 20260624150000, may not be deployed)
ALTER TABLE public.past_paper_questions
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

-- 1. Add new columns
ALTER TABLE public.past_paper_questions
  ADD COLUMN IF NOT EXISTS display_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS exam_session_label text,
  ADD COLUMN IF NOT EXISTS exam_session_source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS appearance_frequency text,
  ADD COLUMN IF NOT EXISTS frequency_score integer,
  ADD COLUMN IF NOT EXISTS frequency_source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS random_sort_key bigint;

-- 2. Add constraints
ALTER TABLE public.past_paper_questions
  DROP CONSTRAINT IF EXISTS past_paper_questions_exam_session_source_check,
  ADD CONSTRAINT past_paper_questions_exam_session_source_check
    CHECK (exam_session_source IN ('official', 'verified', 'user_submitted', 'synthetic', 'unknown'));

ALTER TABLE public.past_paper_questions
  DROP CONSTRAINT IF EXISTS past_paper_questions_frequency_source_check,
  DROP CONSTRAINT IF EXISTS past_paper_questions_frequency_source_check2,
  ADD CONSTRAINT past_paper_questions_frequency_source_check
    CHECK (frequency_source IN ('admin', 'ai_suggested', 'imported', 'unknown', 'verified', 'platform_estimate', 'synthetic'));

ALTER TABLE public.past_paper_questions
  DROP CONSTRAINT IF EXISTS past_paper_questions_appearance_frequency_check,
  ADD CONSTRAINT past_paper_questions_appearance_frequency_check
    CHECK (appearance_frequency IS NULL OR appearance_frequency IN ('low', 'medium', 'high', 'popular'));

ALTER TABLE public.past_paper_questions
  DROP CONSTRAINT IF EXISTS past_paper_questions_frequency_score_check,
  ADD CONSTRAINT past_paper_questions_frequency_score_check
    CHECK (frequency_score IS NULL OR (frequency_score >= 0 AND frequency_score <= 100));

-- 3. Add indexes for sorting
CREATE INDEX IF NOT EXISTS idx_past_paper_questions_random_sort
  ON public.past_paper_questions(random_sort_key)
  WHERE status = 'published' AND is_visible = true;

CREATE INDEX IF NOT EXISTS idx_past_paper_questions_display_published
  ON public.past_paper_questions(display_published_at DESC)
  WHERE status = 'published' AND is_visible = true;

CREATE INDEX IF NOT EXISTS idx_past_paper_questions_frequency_score
  ON public.past_paper_questions(frequency_score DESC)
  WHERE status = 'published' AND is_visible = true;

-- 4. Add comments
COMMENT ON COLUMN public.past_paper_questions.display_published_at IS 'Display date for questions without real published_at. Generated once and persisted.';
COMMENT ON COLUMN public.past_paper_questions.exam_session_label IS 'Human-readable exam session label, e.g. "2025年3月第2场"';
COMMENT ON COLUMN public.past_paper_questions.exam_session_source IS 'Source of exam session info: official, verified, user_submitted, synthetic, unknown';
COMMENT ON COLUMN public.past_paper_questions.appearance_frequency IS 'Display frequency tier: low, medium, high, popular';
COMMENT ON COLUMN public.past_paper_questions.frequency_score IS 'Numeric frequency score 0-100 for sorting';
COMMENT ON COLUMN public.past_paper_questions.frequency_source IS 'Source of frequency data: verified, platform_estimate, synthetic, unknown';
COMMENT ON COLUMN public.past_paper_questions.random_sort_key IS 'Pre-computed random sort key for stable randomized browsing';
