-- Add performance indexes for past_paper_questions table
-- These indexes support the common query patterns used by the public API

-- Composite index for the main list query (status + visibility + task type)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_list_query
ON past_paper_questions (status, is_visible, task_type)
WHERE status = 'published' AND is_visible = true;

-- Index for frequency-based sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_frequency
ON past_paper_questions (frequency_score DESC, frequency_level)
WHERE status = 'published' AND is_visible = true;

-- Index for difficulty sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_difficulty
ON past_paper_questions (difficulty, created_at DESC)
WHERE status = 'published' AND is_visible = true;

-- Index for newest sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_newest
ON past_paper_questions (display_published_at DESC NULLS LAST, created_at DESC)
WHERE status = 'published' AND is_visible = true;

-- Index for exam date filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_exam_date
ON past_paper_questions (exam_date)
WHERE status = 'published' AND is_visible = true AND exam_date IS NOT NULL;

-- Index for search on title and summary
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_search
ON past_paper_questions USING gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, ''))
)
WHERE status = 'published' AND is_visible = true;

-- Index for topic filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_topics
ON past_paper_questions USING gin (topics)
WHERE status = 'published' AND is_visible = true;

-- Index for primary topic filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_primary_topic
ON past_paper_questions (primary_topic)
WHERE status = 'published' AND is_visible = true AND primary_topic IS NOT NULL;

-- Index for source type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_source_type
ON past_paper_questions (source_type)
WHERE status = 'published' AND is_visible = true;

-- Index for exam session filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_exam_session
ON past_paper_questions (exam_session)
WHERE status = 'published' AND is_visible = true;

-- Index for completeness filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_past_paper_questions_completeness
ON past_paper_questions (completeness)
WHERE status = 'published' AND is_visible = true;
