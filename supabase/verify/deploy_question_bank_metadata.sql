-- ============================================================
-- Question Bank Display Metadata - Deploy Script
-- Safe to run on production with existing data
-- ============================================================

-- STEP 1: Add new columns (IF NOT EXISTS makes this idempotent)
ALTER TABLE public.past_paper_questions
  ADD COLUMN IF NOT EXISTS display_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS exam_session_label text,
  ADD COLUMN IF NOT EXISTS exam_session_source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS appearance_frequency text,
  ADD COLUMN IF NOT EXISTS frequency_score integer,
  ADD COLUMN IF NOT EXISTS random_sort_key bigint;

-- frequency_source column already exists with default 'admin'
-- Only add if somehow missing (defensive)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'past_paper_questions'
    AND column_name = 'frequency_source'
  ) THEN
    ALTER TABLE public.past_paper_questions
      ADD COLUMN frequency_source text NOT NULL DEFAULT 'unknown';
  END IF;
END $$;

-- STEP 2: Consolidate frequency_source constraint
-- Drop ALL existing constraints on frequency_source, then add one unified constraint
ALTER TABLE public.past_paper_questions
  DROP CONSTRAINT IF EXISTS past_paper_questions_frequency_source_check;

ALTER TABLE public.past_paper_questions
  DROP CONSTRAINT IF EXISTS past_paper_questions_frequency_source_check2;

ALTER TABLE public.past_paper_questions
  ADD CONSTRAINT past_paper_questions_frequency_source_check
    CHECK (frequency_source IN ('admin', 'ai_suggested', 'imported', 'unknown', 'verified', 'platform_estimate', 'synthetic'));

-- STEP 3: Add other constraints (idempotent with IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'past_paper_questions_exam_session_source_check'
  ) THEN
    ALTER TABLE public.past_paper_questions
      ADD CONSTRAINT past_paper_questions_exam_session_source_check
        CHECK (exam_session_source IN ('official', 'verified', 'user_submitted', 'synthetic', 'unknown'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'past_paper_questions_appearance_frequency_check'
  ) THEN
    ALTER TABLE public.past_paper_questions
      ADD CONSTRAINT past_paper_questions_appearance_frequency_check
        CHECK (appearance_frequency IS NULL OR appearance_frequency IN ('low', 'medium', 'high', 'popular'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'past_paper_questions_frequency_score_check'
  ) THEN
    ALTER TABLE public.past_paper_questions
      ADD CONSTRAINT past_paper_questions_frequency_score_check
        CHECK (frequency_score IS NULL OR (frequency_score >= 0 AND frequency_score <= 100));
  END IF;
END $$;

-- STEP 4: Add indexes
CREATE INDEX IF NOT EXISTS idx_past_paper_questions_random_sort
  ON public.past_paper_questions(random_sort_key)
  WHERE status = 'published' AND is_visible = true;

CREATE INDEX IF NOT EXISTS idx_past_paper_questions_display_published
  ON public.past_paper_questions(display_published_at DESC)
  WHERE status = 'published' AND is_visible = true;

CREATE INDEX IF NOT EXISTS idx_past_paper_questions_frequency_score
  ON public.past_paper_questions(frequency_score DESC)
  WHERE status = 'published' AND is_visible = true;

-- STEP 5: Backfill random_sort_key
UPDATE public.past_paper_questions
SET random_sort_key = abs(hashtext(id::text))
WHERE random_sort_key IS NULL;

-- STEP 6: Backfill display_published_at
UPDATE public.past_paper_questions
SET display_published_at = (
  now() - interval '1 day' * (abs(hashtext(id::text) % 720))
)::timestamptz
WHERE display_published_at IS NULL
  AND published_at IS NULL;

UPDATE public.past_paper_questions
SET display_published_at = published_at
WHERE display_published_at IS NULL
  AND published_at IS NOT NULL;

-- STEP 7: Backfill frequency_score
UPDATE public.past_paper_questions
SET frequency_score = CASE
  WHEN frequency_level = 'high' THEN 75 + (abs(hashtext(id::text)) % 26)
  WHEN frequency_level = 'medium_high' THEN 50 + (abs(hashtext(id::text)) % 26)
  WHEN frequency_level = 'normal' THEN 25 + (abs(hashtext(id::text)) % 26)
  WHEN frequency_level = 'low' THEN 5 + (abs(hashtext(id::text)) % 21)
  ELSE 30 + (abs(hashtext(id::text)) % 41)
END
WHERE frequency_score IS NULL;

-- STEP 8: Backfill appearance_frequency
UPDATE public.past_paper_questions
SET appearance_frequency = CASE
  WHEN frequency_score >= 85 THEN 'popular'
  WHEN frequency_score >= 55 THEN 'high'
  WHEN frequency_score >= 25 THEN 'medium'
  ELSE 'low'
END
WHERE appearance_frequency IS NULL;

-- STEP 9: Backfill frequency_source (only for rows still at 'unknown')
UPDATE public.past_paper_questions
SET frequency_source = 'platform_estimate'
WHERE frequency_source = 'unknown'
  AND frequency_level IS NOT NULL;

-- STEP 10: Backfill exam_session_label
UPDATE public.past_paper_questions
SET exam_session_label = CASE
  WHEN exam_session = 'morning' THEN to_char(exam_date::date, 'YYYY年FMMM月') || '上午场'
  WHEN exam_session = 'afternoon' THEN to_char(exam_date::date, 'YYYY年FMMM月') || '下午场'
  WHEN exam_session = 'evening' THEN to_char(exam_date::date, 'YYYY年FMMM月') || '晚场'
  ELSE to_char(exam_date::date, 'YYYY年FMMM月') || '第' || ((abs(hashtext(id::text)) % 4) + 1) || '场'
END
WHERE exam_session_label IS NULL
  AND exam_date IS NOT NULL;

UPDATE public.past_paper_questions
SET exam_session_label = to_char(display_published_at, 'YYYY年FMMM月') || '第' || ((abs(hashtext(id::text)) % 4) + 1) || '场'
WHERE exam_session_label IS NULL
  AND display_published_at IS NOT NULL;

-- STEP 11: Backfill exam_session_source
UPDATE public.past_paper_questions
SET exam_session_source = 'synthetic'
WHERE exam_session_source = 'unknown'
  AND exam_session_label IS NOT NULL
  AND exam_date IS NULL;

UPDATE public.past_paper_questions
SET exam_session_source = 'verified'
WHERE exam_session_source = 'unknown'
  AND exam_date IS NOT NULL
  AND exam_session != 'unknown';

-- STEP 12: Add comments
COMMENT ON COLUMN public.past_paper_questions.display_published_at IS 'Display date for questions without real published_at. Generated once and persisted.';
COMMENT ON COLUMN public.past_paper_questions.exam_session_label IS 'Human-readable exam session label, e.g. "2025年3月第2场"';
COMMENT ON COLUMN public.past_paper_questions.exam_session_source IS 'Source of exam session info: official, verified, user_submitted, synthetic, unknown';
COMMENT ON COLUMN public.past_paper_questions.appearance_frequency IS 'Display frequency tier: low, medium, high, popular';
COMMENT ON COLUMN public.past_paper_questions.frequency_score IS 'Numeric frequency score 0-100 for sorting';
COMMENT ON COLUMN public.past_paper_questions.random_sort_key IS 'Pre-computed random sort key for stable randomized browsing';

-- ============================================================
-- Verify results
-- ============================================================
SELECT 'Columns check' as check_type, count(*) as found
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'past_paper_questions'
  AND column_name IN ('display_published_at','exam_session_label','exam_session_source','appearance_frequency','frequency_score','random_sort_key','frequency_source');

SELECT 'Data backfill check' as check_type,
  count(*) as total,
  count(display_published_at) as display_date_count,
  count(exam_session_label) as session_count,
  count(appearance_frequency) as frequency_count,
  count(random_sort_key) as random_key_count
FROM public.past_paper_questions;

SELECT frequency_source, count(*) as cnt
FROM public.past_paper_questions
GROUP BY frequency_source
ORDER BY frequency_source;
