-- Remove legacy empty sessions now that the meaningful-draft quota functions
-- ignore empty content. These rows were never shown to users and are not work.
DELETE FROM public.writing_drafts
WHERE (draft_data ->> 'completed') IS DISTINCT FROM 'true'
  AND NOT private.writing_draft_has_content(draft_data, task_type);

-- Incomplete Task 1 Academic questions cannot be rendered as a writing task.
UPDATE public.past_paper_questions
SET is_visible = false,
    completeness = CASE
      WHEN completeness IN ('complete', 'mostly_complete') THEN 'partial'
      ELSE completeness
    END,
    missing_fields = CASE
      WHEN COALESCE(missing_fields, '[]'::jsonb) @> '["visual_data"]'::jsonb
        THEN COALESCE(missing_fields, '[]'::jsonb)
      ELSE COALESCE(missing_fields, '[]'::jsonb) || '["visual_data"]'::jsonb
    END,
    updated_at = now()
WHERE status = 'published'
  AND is_visible = true
  AND task_type = 'task1_academic'
  AND (
    task1_visual_data IS NULL
    OR task1_visual_data = '{}'::jsonb
    OR jsonb_typeof(task1_visual_data) <> 'object'
    OR jsonb_array_length(
      CASE
        WHEN jsonb_typeof(task1_visual_types) = 'array' THEN task1_visual_types
        ELSE '[]'::jsonb
      END
    ) = 0
  );

-- A Task 2 statement without an actual question/instruction is not a complete
-- exam prompt. Hide it until an administrator supplies the missing directive.
UPDATE public.past_paper_questions
SET is_visible = false,
    completeness = CASE
      WHEN completeness IN ('complete', 'mostly_complete') THEN 'partial'
      ELSE completeness
    END,
    missing_fields = CASE
      WHEN COALESCE(missing_fields, '[]'::jsonb) @> '["question_directive"]'::jsonb
        THEN COALESCE(missing_fields, '[]'::jsonb)
      ELSE COALESCE(missing_fields, '[]'::jsonb) || '["question_directive"]'::jsonb
    END,
    updated_at = now()
WHERE status = 'published'
  AND is_visible = true
  AND task_type = 'task2'
  AND position('?' in question_text) = 0
  AND lower(question_text) !~ (
    'do you agree|to what extent|discuss (both|this|these)|give reasons|'
    'give your opinion|what (are|is|can|should|could|do|does)|'
    'why (is|are|do|does|has|have)|how (can|should|could|do|does)|'
    'advantages? (and|or) disadvantages?|benefits? (and|or) drawbacks?|'
    'causes? (and|or) solutions?|problems? (and|or) solutions?|'
    'positive or negative|agree or disagree|'
    'should (people|governments?|this|these|we)|'
    'what is your opinion|what are your views'
  );

-- Pending plan tasks must not retain a link to a question that was hidden by
-- the data-quality cleanup. The API will assign a verified replacement.
UPDATE public.study_plan_tasks AS task
SET question_id = NULL,
    updated_at = now()
FROM public.past_paper_questions AS question
WHERE task.question_id::text = question.id::text
  AND task.status IN ('pending', 'in_progress')
  AND question.is_visible = false;

CREATE OR REPLACE FUNCTION private.normalize_writing_error_category(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE replace(replace(lower(pg_catalog.btrim(COALESCE(p_category, 'other'))), '-', '_'), ' ', '_')
    WHEN 'article' THEN 'article'
    WHEN 'articles' THEN 'article'
    WHEN '冠词' THEN 'article'
    WHEN 'tense' THEN 'tense'
    WHEN 'tenses' THEN 'tense'
    WHEN '时态' THEN 'tense'
    WHEN 'subject_verb_agreement' THEN 'subject_verb_agreement'
    WHEN '主谓一致' THEN 'subject_verb_agreement'
    WHEN 'singular_plural' THEN 'singular_plural'
    WHEN '单复数' THEN 'singular_plural'
    WHEN 'preposition' THEN 'preposition'
    WHEN 'prepositions' THEN 'preposition'
    WHEN '介词' THEN 'preposition'
    WHEN 'sentence_structure' THEN 'sentence_structure'
    WHEN 'grammar' THEN 'sentence_structure'
    WHEN 'unclear_expression' THEN 'cohesion'
    WHEN '句子结构' THEN 'sentence_structure'
    WHEN 'punctuation' THEN 'punctuation'
    WHEN '标点' THEN 'punctuation'
    WHEN 'spelling' THEN 'spelling'
    WHEN '拼写' THEN 'spelling'
    WHEN 'word_choice' THEN 'word_choice'
    WHEN 'vocabulary' THEN 'word_choice'
    WHEN 'lexical' THEN 'word_choice'
    WHEN 'style' THEN 'word_choice'
    WHEN 'repetition' THEN 'word_choice'
    WHEN '用词' THEN 'word_choice'
    WHEN 'collocation' THEN 'collocation'
    WHEN '搭配' THEN 'collocation'
    WHEN 'cohesion' THEN 'cohesion'
    WHEN 'coherence' THEN 'cohesion'
    WHEN '衔接' THEN 'cohesion'
    WHEN 'task_response' THEN 'task_response'
    WHEN 'task_achievement' THEN 'task_response'
    WHEN 'task' THEN 'task_response'
    WHEN '任务回应' THEN 'task_response'
    WHEN 'idea_development' THEN 'idea_development'
    WHEN '论证展开' THEN 'idea_development'
    WHEN 'overview' THEN 'overview'
    WHEN '概述' THEN 'overview'
    WHEN 'data_comparison' THEN 'data_comparison'
    WHEN '数据比较' THEN 'data_comparison'
    WHEN 'map_tense' THEN 'map_tense'
    WHEN '地图时态' THEN 'map_tense'
    WHEN 'process_sequence' THEN 'process_sequence'
    WHEN '流程顺序' THEN 'process_sequence'
    ELSE 'other'
  END;
$$;

CREATE OR REPLACE FUNCTION private.normalize_writing_error_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT left(
    trim(both '_' FROM regexp_replace(
      lower(pg_catalog.btrim(COALESCE(p_value, ''))),
      '[^[:alnum:]]+',
      '_',
      'g'
    )),
    180
  );
$$;

CREATE TEMP TABLE writing_error_pattern_merge ON COMMIT DROP AS
WITH normalized AS (
  SELECT
    pattern.id,
    pattern.user_id,
    private.normalize_writing_error_category(pattern.category) AS new_category,
    private.normalize_writing_error_category(pattern.category) || ':' ||
      COALESCE(
        NULLIF(concat_ws(
          '=>',
          NULLIF(private.normalize_writing_error_text(pattern.example_wrong), ''),
          NULLIF(private.normalize_writing_error_text(pattern.example_correct), '')
        ), ''),
        NULLIF(private.normalize_writing_error_text(pattern.title), ''),
        'unknown'
      ) AS new_key,
    pattern.first_seen_at,
    pattern.last_seen_at,
    pattern.mastery_level
  FROM public.writing_error_patterns AS pattern
),
ranked AS (
  SELECT
    normalized.*,
    first_value(id) OVER (
      PARTITION BY user_id, new_key
      ORDER BY first_seen_at ASC NULLS LAST, id
    ) AS survivor_id,
    min(first_seen_at) OVER (PARTITION BY user_id, new_key) AS merged_first_seen_at,
    max(last_seen_at) OVER (PARTITION BY user_id, new_key) AS merged_last_seen_at,
    max(mastery_level) OVER (PARTITION BY user_id, new_key) AS merged_mastery_level
  FROM normalized
)
SELECT * FROM ranked;

UPDATE public.writing_error_occurrences AS occurrence
SET error_pattern_id = merge.survivor_id
FROM writing_error_pattern_merge AS merge
WHERE occurrence.error_pattern_id = merge.id
  AND occurrence.error_pattern_id <> merge.survivor_id;

UPDATE public.writing_error_reviews AS review
SET error_pattern_id = merge.survivor_id
FROM writing_error_pattern_merge AS merge
WHERE review.error_pattern_id = merge.id
  AND review.error_pattern_id <> merge.survivor_id;

DELETE FROM public.writing_error_patterns AS pattern
USING writing_error_pattern_merge AS merge
WHERE pattern.id = merge.id
  AND merge.id <> merge.survivor_id;

WITH survivors AS (
  SELECT DISTINCT ON (survivor_id)
    survivor_id,
    new_category,
    new_key,
    merged_first_seen_at,
    merged_last_seen_at,
    merged_mastery_level
  FROM writing_error_pattern_merge
  ORDER BY survivor_id
),
occurrence_counts AS (
  SELECT error_pattern_id, count(DISTINCT writing_record_id)::integer AS count
  FROM public.writing_error_occurrences
  GROUP BY error_pattern_id
)
UPDATE public.writing_error_patterns AS pattern
SET category = survivors.new_category,
    normalized_key = survivors.new_key,
    title = CASE survivors.new_category
      WHEN 'article' THEN '冠词'
      WHEN 'tense' THEN '时态'
      WHEN 'subject_verb_agreement' THEN '主谓一致'
      WHEN 'singular_plural' THEN '单复数'
      WHEN 'preposition' THEN '介词'
      WHEN 'sentence_structure' THEN '句子结构'
      WHEN 'punctuation' THEN '标点'
      WHEN 'spelling' THEN '拼写'
      WHEN 'word_choice' THEN '用词'
      WHEN 'collocation' THEN '搭配'
      WHEN 'cohesion' THEN '衔接'
      WHEN 'task_response' THEN '任务回应'
      WHEN 'idea_development' THEN '论证展开'
      WHEN 'overview' THEN '概述'
      WHEN 'data_comparison' THEN '数据比较'
      WHEN 'map_tense' THEN '地图时态'
      WHEN 'process_sequence' THEN '流程顺序'
      ELSE '其他'
    END,
    occurrence_count = GREATEST(1, COALESCE(occurrence_counts.count, 0)),
    first_seen_at = survivors.merged_first_seen_at,
    last_seen_at = survivors.merged_last_seen_at,
    mastery_level = survivors.merged_mastery_level,
    updated_at = now()
FROM survivors
LEFT JOIN occurrence_counts
  ON occurrence_counts.error_pattern_id = survivors.survivor_id
WHERE pattern.id = survivors.survivor_id;

REVOKE ALL ON FUNCTION private.normalize_writing_error_category(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.normalize_writing_error_text(text) FROM PUBLIC;
