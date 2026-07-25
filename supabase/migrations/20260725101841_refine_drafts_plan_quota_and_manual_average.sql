-- Manual learning-analysis average override, stored per account.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manual_average_score numeric(2,1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_manual_average_score_valid'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_manual_average_score_valid
      CHECK (
        manual_average_score IS NULL
        OR (
          manual_average_score >= 0
          AND manual_average_score <= 9
          AND mod(manual_average_score * 2, 1) = 0
        )
      );
  END IF;
END;
$$;

GRANT UPDATE (manual_average_score) ON public.profiles TO authenticated;

COMMENT ON COLUMN public.profiles.manual_average_score IS
  'Optional user-controlled overall average shown in learning analytics; null uses calculated records.';

-- Empty writing sessions remain resumable by id while open, but they do not
-- appear in draft lists and do not consume the meaningful-draft quota.
CREATE OR REPLACE FUNCTION private.writing_draft_has_content(
  p_draft_data jsonb,
  p_task_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_task_type = 'mock' THEN
      pg_catalog.btrim(COALESCE(p_draft_data #>> '{task1,essay}', '')) <> ''
      OR pg_catalog.btrim(COALESCE(p_draft_data #>> '{task2,essay}', '')) <> ''
    ELSE
      pg_catalog.btrim(COALESCE(
        p_draft_data #>> '{task,essay}',
        p_draft_data ->> 'essay',
        ''
      )) <> ''
  END;
$$;

CREATE OR REPLACE FUNCTION private.create_writing_draft(
  p_id text,
  p_task_type text,
  p_request_id text,
  p_draft_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_count integer;
  v_existing public.writing_drafts%ROWTYPE;
  v_created public.writing_drafts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DRAFT_ACCESS_DENIED';
  END IF;

  IF p_task_type NOT IN ('task1', 'task2', 'mock') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DRAFT_CREATE_FAILED';
  END IF;

  IF length(p_id) < 1 OR length(p_id) > 180
    OR length(p_request_id) < 1 OR length(p_request_id) > 180 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DRAFT_CREATE_FAILED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':draft-create:' || p_task_type, 0)
  );

  SELECT *
  INTO v_existing
  FROM public.writing_drafts
  WHERE user_id = v_user_id
    AND request_id = p_request_id;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'taskType', v_existing.task_type,
      'created', false,
      'createdAt', v_existing.created_at,
      'updatedAt', v_existing.updated_at
    );
  END IF;

  -- Clear abandoned empty sessions after one day without charging delete quota.
  DELETE FROM public.writing_drafts
  WHERE user_id = v_user_id
    AND task_type = p_task_type
    AND updated_at < now() - interval '24 hours'
    AND (draft_data ->> 'completed') IS DISTINCT FROM 'true'
    AND NOT private.writing_draft_has_content(draft_data, task_type);

  v_limit := CASE WHEN p_task_type = 'mock' THEN 3 ELSE 5 END;

  SELECT count(*)
  INTO v_count
  FROM public.writing_drafts
  WHERE user_id = v_user_id
    AND task_type = p_task_type
    AND (draft_data ->> 'completed') IS DISTINCT FROM 'true'
    AND private.writing_draft_has_content(draft_data, task_type);

  IF v_count >= v_limit
    AND private.writing_draft_has_content(COALESCE(p_draft_data, '{}'::jsonb), p_task_type) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = CASE
        WHEN p_task_type = 'task1' THEN 'DRAFT_LIMIT_REACHED_TASK1'
        WHEN p_task_type = 'task2' THEN 'DRAFT_LIMIT_REACHED_TASK2'
        ELSE 'DRAFT_LIMIT_REACHED_FULL_TEST'
      END;
  END IF;

  INSERT INTO public.writing_drafts (
    id,
    user_id,
    task_type,
    request_id,
    draft_data,
    created_at,
    updated_at
  )
  VALUES (
    p_id,
    v_user_id,
    p_task_type,
    p_request_id,
    COALESCE(p_draft_data, '{}'::jsonb),
    now(),
    now()
  )
  RETURNING * INTO v_created;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_created.id,
    'taskType', v_created.task_type,
    'created', true,
    'createdAt', v_created.created_at,
    'updatedAt', v_created.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.update_writing_draft(
  p_id text,
  p_task_type text,
  p_draft_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_count integer;
  v_existing public.writing_drafts%ROWTYPE;
  v_updated public.writing_drafts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DRAFT_ACCESS_DENIED';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.writing_drafts
  WHERE user_id = v_user_id
    AND id = p_id
    AND task_type = p_task_type
    AND (draft_data ->> 'completed') IS DISTINCT FROM 'true';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DRAFT_NOT_FOUND';
  END IF;

  IF NOT private.writing_draft_has_content(v_existing.draft_data, p_task_type)
    AND private.writing_draft_has_content(COALESCE(p_draft_data, '{}'::jsonb), p_task_type) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text || ':draft-create:' || p_task_type, 0)
    );

    v_limit := CASE WHEN p_task_type = 'mock' THEN 3 ELSE 5 END;
    SELECT count(*)
    INTO v_count
    FROM public.writing_drafts
    WHERE user_id = v_user_id
      AND task_type = p_task_type
      AND id <> p_id
      AND (draft_data ->> 'completed') IS DISTINCT FROM 'true'
      AND private.writing_draft_has_content(draft_data, task_type);

    IF v_count >= v_limit THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = CASE
          WHEN p_task_type = 'task1' THEN 'DRAFT_LIMIT_REACHED_TASK1'
          WHEN p_task_type = 'task2' THEN 'DRAFT_LIMIT_REACHED_TASK2'
          ELSE 'DRAFT_LIMIT_REACHED_FULL_TEST'
        END;
    END IF;
  END IF;

  UPDATE public.writing_drafts
  SET draft_data = COALESCE(p_draft_data, '{}'::jsonb),
      updated_at = now()
  WHERE user_id = v_user_id
    AND id = p_id
    AND task_type = p_task_type
    AND (draft_data ->> 'completed') IS DISTINCT FROM 'true'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DRAFT_NOT_FOUND';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_updated.id,
    'taskType', v_updated.task_type,
    'updatedAt', v_updated.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION private.writing_draft_has_content(jsonb, text) FROM PUBLIC;

COMMENT ON TABLE public.study_plan_adjustment_wallets IS
  'Deprecated legacy adjustment-point wallet. New plan changes use a monthly three-change quota.';
COMMENT ON TABLE public.study_plan_adjustment_transactions IS
  'Deprecated legacy adjustment-point audit log. Retained for historical records only.';

-- Adjustment points are no longer part of the product. Preserve the historical
-- wallet and audit rows, but remove every callable mutation path.
DROP FUNCTION IF EXISTS public.award_adjustment_points(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.spend_adjustment_points(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.refund_adjustment_points(uuid, integer, text, text);

-- Reserve at most three replan jobs per Shanghai calendar month. Initial plan
-- creation and failed/cancelled replans do not consume a chance.
CREATE OR REPLACE FUNCTION private.enforce_monthly_study_plan_adjustment_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month_start timestamptz;
  v_next_month_start timestamptz;
  v_count integer;
BEGIN
  IF NEW.job_type IS DISTINCT FROM 'replan'
    OR NEW.status NOT IN ('queued', 'running', 'completed') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.job_type = 'replan'
    AND OLD.status IN ('queued', 'running', 'completed') THEN
    RETURN NEW;
  END IF;

  v_month_start := date_trunc(
    'month',
    pg_catalog.timezone('Asia/Shanghai', COALESCE(NEW.created_at, now()))
  ) AT TIME ZONE 'Asia/Shanghai';
  v_next_month_start := v_month_start + interval '1 month';

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.user_id::text || ':study-plan-adjust:'
        || to_char(pg_catalog.timezone('Asia/Shanghai', v_month_start), 'YYYY-MM'),
      0
    )
  );

  SELECT count(*)
  INTO v_count
  FROM public.study_plan_generation_jobs
  WHERE user_id = NEW.user_id
    AND id <> NEW.id
    AND job_type = 'replan'
    AND status IN ('queued', 'running', 'completed')
    AND created_at >= v_month_start
    AND created_at < v_next_month_start;

  IF v_count >= 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'STUDY_PLAN_MONTHLY_ADJUSTMENT_LIMIT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_study_plan_monthly_adjustment_limit
  ON public.study_plan_generation_jobs;
CREATE TRIGGER trg_study_plan_monthly_adjustment_limit
BEFORE INSERT OR UPDATE OF status, job_type
ON public.study_plan_generation_jobs
FOR EACH ROW
EXECUTE FUNCTION private.enforce_monthly_study_plan_adjustment_limit();

REVOKE ALL ON FUNCTION private.enforce_monthly_study_plan_adjustment_limit() FROM PUBLIC;
