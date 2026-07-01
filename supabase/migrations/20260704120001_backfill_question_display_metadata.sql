-- Backfill display metadata for past_paper_questions
-- This script is idempotent: only updates NULL fields, never overwrites real data
-- Run after 20260704120000_question_bank_display_metadata.sql

-- ============================================================
-- 1. random_sort_key: deterministic random based on id hash
-- ============================================================
UPDATE public.past_paper_questions
SET random_sort_key = abs(hashtext(id::text))
WHERE random_sort_key IS NULL;

-- ============================================================
-- 2. display_published_at: for questions without published_at
--    Range: last 24 months, distributed by id hash
-- ============================================================
UPDATE public.past_paper_questions
SET display_published_at = (
  now() - interval '1 day' * (abs(hashtext(id::text) % 720))
)::timestamptz
WHERE display_published_at IS NULL
  AND published_at IS NULL;

-- For questions with published_at, copy it to display_published_at
UPDATE public.past_paper_questions
SET display_published_at = published_at
WHERE display_published_at IS NULL
  AND published_at IS NOT NULL;

-- ============================================================
-- 3. frequency_score: map existing frequency_level to score
--    Only for questions without frequency_score
-- ============================================================
UPDATE public.past_paper_questions
SET frequency_score = CASE
  WHEN frequency_level = 'high' THEN 75 + (abs(hashtext(id::text)) % 26)  -- 75-100
  WHEN frequency_level = 'medium_high' THEN 50 + (abs(hashtext(id::text)) % 26)  -- 50-75
  WHEN frequency_level = 'normal' THEN 25 + (abs(hashtext(id::text)) % 26)  -- 25-50
  WHEN frequency_level = 'low' THEN 5 + (abs(hashtext(id::text)) % 21)  -- 5-25
  ELSE 30 + (abs(hashtext(id::text)) % 41)  -- 30-70 for unknown
END
WHERE frequency_score IS NULL;

-- ============================================================
-- 4. appearance_frequency: derive from frequency_score
-- ============================================================
UPDATE public.past_paper_questions
SET appearance_frequency = CASE
  WHEN frequency_score >= 85 THEN 'popular'
  WHEN frequency_score >= 55 THEN 'high'
  WHEN frequency_score >= 25 THEN 'medium'
  ELSE 'low'
END
WHERE appearance_frequency IS NULL;

-- ============================================================
-- 5. frequency_source: normalize to platform_estimate
-- ============================================================
-- 'admin' was the original default meaning "platform-set reference frequency"
-- Map it to 'platform_estimate' so the UI can display it properly
UPDATE public.past_paper_questions
SET frequency_source = 'platform_estimate'
WHERE frequency_source = 'admin';

UPDATE public.past_paper_questions
SET frequency_source = 'platform_estimate'
WHERE frequency_source = 'unknown'
  AND frequency_level IS NOT NULL;

-- ============================================================
-- 6. exam_session_label: generate synthetic labels for questions
--    that have exam_date but no exam_session_label
-- ============================================================
UPDATE public.past_paper_questions
SET exam_session_label = CASE
  WHEN exam_session = 'morning' THEN to_char(exam_date::date, 'YYYY年FMMM月') || '上午场'
  WHEN exam_session = 'afternoon' THEN to_char(exam_date::date, 'YYYY年FMMM月') || '下午场'
  WHEN exam_session = 'evening' THEN to_char(exam_date::date, 'YYYY年FMMM月') || '晚场'
  ELSE to_char(exam_date::date, 'YYYY年FMMM月') || '第' || ((abs(hashtext(id::text)) % 4) + 1) || '场'
END
WHERE exam_session_label IS NULL
  AND exam_date IS NOT NULL;

-- For questions without exam_date, generate from display_published_at
UPDATE public.past_paper_questions
SET exam_session_label = to_char(display_published_at, 'YYYY年FMMM月') || '第' || ((abs(hashtext(id::text)) % 4) + 1) || '场'
WHERE exam_session_label IS NULL
  AND display_published_at IS NOT NULL;

-- ============================================================
-- 7. exam_session_source: mark synthetic for generated labels
-- ============================================================
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

-- ============================================================
-- Done. Verify with:
-- SELECT count(*) as total,
--        count(random_sort_key) as has_sort_key,
--        count(display_published_at) as has_display_date,
--        count(frequency_score) as has_freq_score,
--        count(exam_session_label) as has_session_label
-- FROM public.past_paper_questions
-- WHERE status = 'published';
-- ============================================================
