-- ============================================================
-- Repair migration history: mark 20260703120000 as applied
-- Run this in Supabase Dashboard SQL Editor
-- ============================================================
-- The schema for this migration was already applied manually.
-- This inserts the history record so supabase db push works correctly.

INSERT INTO supabase_migrations.schema_migrations (version, name, statements, executed_at)
VALUES (
  '20260703120000',
  'question_source_ratio',
  ARRAY['-- applied manually via dashboard'],
  now()
)
ON CONFLICT (version) DO NOTHING;

-- Verify
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
WHERE version >= '20260630'
ORDER BY version;
