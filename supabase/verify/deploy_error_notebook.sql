-- ============================================================
-- Error notebook tables - standalone migration
-- Run this in Supabase Dashboard SQL Editor
-- ============================================================

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

-- Unique constraint: one occurrence per pattern per record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'writing_error_occurrences_pattern_record_unique'
      AND conrelid = 'public.writing_error_occurrences'::regclass
  ) THEN
    ALTER TABLE public.writing_error_occurrences
      ADD CONSTRAINT writing_error_occurrences_pattern_record_unique
      UNIQUE (error_pattern_id, writing_record_id);
  END IF;
END $$;

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

-- Add extraction tracking field to writing_records if not exists
ALTER TABLE public.writing_records
  ADD COLUMN IF NOT EXISTS error_extracted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_writing_records_error_extracted
  ON public.writing_records(user_id, error_extracted_at)
  WHERE error_extracted_at IS NOT NULL;

COMMENT ON TABLE public.writing_error_patterns IS 'Aggregated error patterns per user, deduplicated by normalized_key';
COMMENT ON TABLE public.writing_error_occurrences IS 'Individual error occurrences linked to specific writing records';
COMMENT ON TABLE public.writing_error_reviews IS 'User review history for error patterns, tracking mastery progression';
COMMENT ON COLUMN public.writing_records.error_extracted_at IS 'Timestamp when errors were extracted from this record for the error notebook';
