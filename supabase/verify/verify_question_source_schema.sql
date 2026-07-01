-- ============================================================
-- Verify question source ratio schema on remote
-- Run this in Supabase Dashboard SQL Editor AFTER repair
-- ============================================================

-- 1. Check study_plan_profiles columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'study_plan_profiles'
  AND column_name IN ('question_bank_ratio', 'ai_generated_ratio')
ORDER BY column_name;

-- 2. Check study_plan_tasks columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'study_plan_tasks'
  AND column_name IN ('question_source', 'original_question_source', 'fallback_reason')
ORDER BY column_name;

-- 3. Check constraints
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid IN ('public.study_plan_profiles'::regclass, 'public.study_plan_tasks'::regclass)
  AND conname LIKE '%qratio%' OR conname LIKE '%question_source%'
ORDER BY conname;

-- 4. Check RPC exists and has correct signature
SELECT routine_name, routine_schema, security_type
FROM information_schema.routines
WHERE routine_name = 'save_generated_study_plan'
ORDER BY routine_schema;

-- 5. Check migration history
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
WHERE version >= '20260630'
ORDER BY version;

-- 6. Sample data: profile ratios
SELECT user_id, question_bank_ratio, ai_generated_ratio
FROM public.study_plan_profiles
LIMIT 5;

-- 7. Sample data: task question sources
SELECT question_source, count(*) as cnt
FROM public.study_plan_tasks
GROUP BY question_source;
