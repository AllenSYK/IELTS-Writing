-- ============================================================
-- One-time legacy MapSchemaV1 cleanup and enforcement
-- ============================================================
-- This migration:
--   1. Audits all JSONB columns containing mapSpec
--   2. Deletes rows with legacy V1 map data (Option B)
--   3. Adds a trigger to enforce V2-only mapSpec on write
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Audit — create a temp table to log affected rows
-- ──────────────────────────────────────────────────────────────

CREATE TEMP TABLE _map_v1_audit (
  table_name text NOT NULL,
  row_id text NOT NULL,
  map_path text NOT NULL,
  has_features_position boolean DEFAULT false,
  missing_data_version boolean DEFAULT false,
  data_version text,
  action_taken text DEFAULT 'pending'
);

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Scan writing_records.record_data
-- ──────────────────────────────────────────────────────────────

-- 2a. Top-level mapSpec with legacy features.position
INSERT INTO _map_v1_audit (table_name, row_id, map_path, has_features_position, data_version)
SELECT
  'writing_records',
  id::text,
  'record_data->mapSpec',
  true,
  record_data->'mapSpec'->>'dataVersion'
FROM writing_records
WHERE record_data ? 'mapSpec'
  AND record_data->'mapSpec' ? 'features'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(record_data->'mapSpec'->'features') f
    WHERE f ? 'position'
  );

-- 2b. Top-level mapSpec missing dataVersion (not v2)
INSERT INTO _map_v1_audit (table_name, row_id, map_path, missing_data_version, data_version)
SELECT
  'writing_records',
  id::text,
  'record_data->mapSpec',
  true,
  record_data->'mapSpec'->>'dataVersion'
FROM writing_records
WHERE record_data ? 'mapSpec'
  AND record_data->'mapSpec' ? 'features'
  AND NOT (record_data->'mapSpec' ? 'dataVersion')
  AND id::text NOT IN (SELECT row_id FROM _map_v1_audit WHERE table_name = 'writing_records');

-- 2c. components.task1.mapSpec with legacy features.position
INSERT INTO _map_v1_audit (table_name, row_id, map_path, has_features_position, data_version)
SELECT
  'writing_records',
  id::text,
  'record_data->components->task1->mapSpec',
  true,
  record_data->'components'->'task1'->'mapSpec'->>'dataVersion'
FROM writing_records
WHERE record_data->'components'->'task1' ? 'mapSpec'
  AND record_data->'components'->'task1'->'mapSpec' ? 'features'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(record_data->'components'->'task1'->'mapSpec'->'features') f
    WHERE f ? 'position'
  );

-- 2d. components.task2.mapSpec with legacy features.position
INSERT INTO _map_v1_audit (table_name, row_id, map_path, has_features_position, data_version)
SELECT
  'writing_records',
  id::text,
  'record_data->components->task2->mapSpec',
  true,
  record_data->'components'->'task2'->'mapSpec'->>'dataVersion'
FROM writing_records
WHERE record_data->'components'->'task2' ? 'mapSpec'
  AND record_data->'components'->'task2'->'mapSpec' ? 'features'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(record_data->'components'->'task2'->'mapSpec'->'features') f
    WHERE f ? 'position'
  );

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Scan writing_drafts.draft_data
-- ──────────────────────────────────────────────────────────────

-- 3a. task.mapSpec (single-task drafts)
INSERT INTO _map_v1_audit (table_name, row_id, map_path, has_features_position, data_version)
SELECT
  'writing_drafts',
  user_id || ':' || id,
  'draft_data->task->mapSpec',
  true,
  draft_data->'task'->'mapSpec'->>'dataVersion'
FROM writing_drafts
WHERE draft_data->'task' ? 'mapSpec'
  AND draft_data->'task'->'mapSpec' ? 'features'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(draft_data->'task'->'mapSpec'->'features') f
    WHERE f ? 'position'
  );

-- 3b. task1.mapSpec (full-test drafts)
INSERT INTO _map_v1_audit (table_name, row_id, map_path, has_features_position, data_version)
SELECT
  'writing_drafts',
  user_id || ':' || id,
  'draft_data->task1->mapSpec',
  true,
  draft_data->'task1'->'mapSpec'->>'dataVersion'
FROM writing_drafts
WHERE draft_data->'task1' ? 'mapSpec'
  AND draft_data->'task1'->'mapSpec' ? 'features'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(draft_data->'task1'->'mapSpec'->'features') f
    WHERE f ? 'position'
  );

-- ──────────────────────────────────────────────────────────────
-- STEP 4: Scan writing_task_uploads.confirmed_question
-- ──────────────────────────────────────────────────────────────

INSERT INTO _map_v1_audit (table_name, row_id, map_path, has_features_position, data_version)
SELECT
  'writing_task_uploads',
  id::text,
  'confirmed_question->mapSpec',
  true,
  confirmed_question->'mapSpec'->>'dataVersion'
FROM writing_task_uploads
WHERE confirmed_question ? 'mapSpec'
  AND confirmed_question->'mapSpec' ? 'features'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(confirmed_question->'mapSpec'->'features') f
    WHERE f ? 'position'
  );

-- ──────────────────────────────────────────────────────────────
-- STEP 5: Delete legacy V1 map data (Option B)
-- ──────────────────────────────────────────────────────────────
-- We DELETE rather than convert because:
--   - The TypeScript converter is heuristic (~180 lines)
--   - Map questions are rare (mostly same river crossing template)
--   - Incorrect conversion is worse than deletion
--   - Users can regenerate questions
-- ──────────────────────────────────────────────────────────────

-- 5a. Remove legacy mapSpec from writing_records (set to null)
UPDATE writing_records
SET record_data = record_data - 'mapSpec'
WHERE id::text IN (
  SELECT row_id FROM _map_v1_audit
  WHERE table_name = 'writing_records' AND map_path = 'record_data->mapSpec'
);

-- Remove legacy mapSpec from components.task1
UPDATE writing_records
SET record_data = jsonb_set(
  record_data,
  '{components,task1}',
  (record_data->'components'->'task1') - 'mapSpec'
)
WHERE id::text IN (
  SELECT row_id FROM _map_v1_audit
  WHERE table_name = 'writing_records' AND map_path = 'record_data->components->task1->mapSpec'
);

-- Remove legacy mapSpec from components.task2
UPDATE writing_records
SET record_data = jsonb_set(
  record_data,
  '{components,task2}',
  (record_data->'components'->'task2') - 'mapSpec'
)
WHERE id::text IN (
  SELECT row_id FROM _map_v1_audit
  WHERE table_name = 'writing_records' AND map_path = 'record_data->components->task2->mapSpec'
);

-- 5b. Remove legacy mapSpec from writing_drafts
UPDATE writing_drafts
SET draft_data = jsonb_set(draft_data, '{task}', (draft_data->'task') - 'mapSpec')
WHERE user_id || ':' || id IN (
  SELECT row_id FROM _map_v1_audit
  WHERE table_name = 'writing_drafts' AND map_path = 'draft_data->task->mapSpec'
);

UPDATE writing_drafts
SET draft_data = jsonb_set(draft_data, '{task1}', (draft_data->'task1') - 'mapSpec')
WHERE user_id || ':' || id IN (
  SELECT row_id FROM _map_v1_audit
  WHERE table_name = 'writing_drafts' AND map_path = 'draft_data->task1->mapSpec'
);

-- 5c. Remove legacy mapSpec from writing_task_uploads
UPDATE writing_task_uploads
SET confirmed_question = confirmed_question - 'mapSpec'
WHERE id::text IN (
  SELECT row_id FROM _map_v1_audit
  WHERE table_name = 'writing_task_uploads'
);

-- Update audit log
UPDATE _map_v1_audit SET action_taken = 'deleted_mapSpec';

-- ──────────────────────────────────────────────────────────────
-- STEP 6: Report affected rows
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM _map_v1_audit;
  RAISE NOTICE 'Map V1 cleanup: % legacy mapSpec fields removed', v_count;

  IF v_count > 0 THEN
    RAISE NOTICE 'Affected tables:';
    FOR t IN SELECT DISTINCT table_name FROM _map_v1_audit LOOP
      SELECT count(*) INTO v_count FROM _map_v1_audit WHERE table_name = t;
      RAISE NOTICE '  - %: % rows', t, v_count;
    END LOOP;
  ELSE
    RAISE NOTICE 'No legacy mapSpec data found. Database is clean.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- STEP 7: Add DB-level enforcement trigger
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_map_spec_v2()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_map jsonb;
  v_path text[];
  v_data_version text;
  v_has_panels boolean;
  v_has_legacy_position boolean;
BEGIN
  -- Check writing_records.record_data
  IF TG_TABLE_NAME = 'writing_records' THEN
    -- Top-level mapSpec
    IF NEW.record_data ? 'mapSpec' THEN
      v_map := NEW.record_data->'mapSpec';
      PERFORM public._assert_map_v2(v_map, 'record_data.mapSpec');
    END IF;
    -- components.task1.mapSpec
    IF NEW.record_data->'components'->'task1' ? 'mapSpec' THEN
      v_map := NEW.record_data->'components'->'task1'->'mapSpec';
      PERFORM public._assert_map_v2(v_map, 'record_data.components.task1.mapSpec');
    END IF;
    -- components.task2.mapSpec
    IF NEW.record_data->'components'->'task2' ? 'mapSpec' THEN
      v_map := NEW.record_data->'components'->'task2'->'mapSpec';
      PERFORM public._assert_map_v2(v_map, 'record_data.components.task2.mapSpec');
    END IF;
  END IF;

  -- Check writing_drafts.draft_data
  IF TG_TABLE_NAME = 'writing_drafts' THEN
    -- task.mapSpec
    IF NEW.draft_data->'task' ? 'mapSpec' THEN
      v_map := NEW.draft_data->'task'->'mapSpec';
      PERFORM public._assert_map_v2(v_map, 'draft_data.task.mapSpec');
    END IF;
    -- task1.mapSpec
    IF NEW.draft_data->'task1' ? 'mapSpec' THEN
      v_map := NEW.draft_data->'task1'->'mapSpec';
      PERFORM public._assert_map_v2(v_map, 'draft_data.task1.mapSpec');
    END IF;
    -- task2.mapSpec
    IF NEW.draft_data->'task2' ? 'mapSpec' THEN
      v_map := NEW.draft_data->'task2'->'mapSpec';
      PERFORM public._assert_map_v2(v_map, 'draft_data.task2.mapSpec');
    END IF;
  END IF;

  -- Check writing_task_uploads.confirmed_question
  IF TG_TABLE_NAME = 'writing_task_uploads' THEN
    IF NEW.confirmed_question ? 'mapSpec' THEN
      v_map := NEW.confirmed_question->'mapSpec';
      PERFORM public._assert_map_v2(v_map, 'confirmed_question.mapSpec');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Helper: assert a jsonb mapSpec is valid V2
CREATE OR REPLACE FUNCTION public._assert_map_v2(p_map jsonb, p_path text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_data_version text;
  v_has_panels boolean;
  v_has_legacy_position boolean;
BEGIN
  -- Must be an object
  IF p_map IS NULL OR jsonb_typeof(p_map) != 'object' THEN
    RAISE EXCEPTION 'INVALID_MAP_SCHEMA: mapSpec at % must be a JSON object', p_path;
  END IF;

  -- Must have dataVersion = 'map-v2'
  v_data_version := p_map->>'dataVersion';
  IF v_data_version IS NULL OR v_data_version != 'map-v2' THEN
    RAISE EXCEPTION 'INVALID_MAP_SCHEMA_VERSION: mapSpec at % must have dataVersion "map-v2" (got: %)', p_path, COALESCE(v_data_version, 'null');
  END IF;

  -- Must have panels array (non-empty)
  v_has_panels := p_map ? 'panels'
    AND jsonb_typeof(p_map->'panels') = 'array'
    AND jsonb_array_length(p_map->'panels') > 0;
  IF NOT v_has_panels THEN
    RAISE EXCEPTION 'INVALID_MAP_SCHEMA: mapSpec at % must have non-empty panels[] array', p_path;
  END IF;

  -- Must NOT have legacy features with position
  IF p_map ? 'features' AND jsonb_typeof(p_map->'features') = 'array' THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_map->'features') f
      WHERE f ? 'position'
    ) INTO v_has_legacy_position;
    IF v_has_legacy_position THEN
      RAISE EXCEPTION 'INVALID_MAP_SCHEMA_VERSION: mapSpec at % must not contain legacy features[].position', p_path;
    END IF;
  END IF;
END;
$$;

-- Install triggers on all three tables
DROP TRIGGER IF EXISTS trg_validate_map_spec_v2 ON writing_records;
CREATE TRIGGER trg_validate_map_spec_v2
  BEFORE INSERT OR UPDATE ON writing_records
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_map_spec_v2();

DROP TRIGGER IF EXISTS trg_validate_map_spec_v2 ON writing_drafts;
CREATE TRIGGER trg_validate_map_spec_v2
  BEFORE INSERT OR UPDATE ON writing_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_map_spec_v2();

DROP TRIGGER IF EXISTS trg_validate_map_spec_v2 ON writing_task_uploads;
CREATE TRIGGER trg_validate_map_spec_v2
  BEFORE INSERT OR UPDATE ON writing_task_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_map_spec_v2();

-- Revoke public access to helper function
REVOKE ALL ON FUNCTION public._assert_map_v2(jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.validate_map_spec_v2() FROM public;
GRANT EXECUTE ON FUNCTION public._assert_map_v2(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_map_spec_v2() TO service_role;

-- ──────────────────────────────────────────────────────────────
-- STEP 8: Drop temp audit table
-- ──────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS _map_v1_audit;
