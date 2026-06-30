-- ============================================================
-- Background study plan generation jobs and adjustment points
-- Run this in Supabase Dashboard SQL Editor
-- ============================================================

-- Background generation jobs table
CREATE TABLE IF NOT EXISTS public.study_plan_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  current_step text,
  input_data jsonb NOT NULL DEFAULT '{}',
  result_plan_id uuid,
  error_code text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_plan_generation_jobs_status_check'
      AND conrelid = 'public.study_plan_generation_jobs'::regclass
  ) THEN
    ALTER TABLE public.study_plan_generation_jobs
      ADD CONSTRAINT study_plan_generation_jobs_status_check
      CHECK (status IN ('queued', 'analyzing_history', 'building_profile', 'generating_tasks', 'saving', 'completed', 'failed', 'cancelled'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_plan_gen_jobs_active
  ON public.study_plan_generation_jobs(user_id)
  WHERE status IN ('queued', 'analyzing_history', 'building_profile', 'generating_tasks', 'saving');

CREATE INDEX IF NOT EXISTS idx_study_plan_gen_jobs_user_created
  ON public.study_plan_generation_jobs(user_id, created_at DESC);

ALTER TABLE public.study_plan_generation_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'study_plan_gen_jobs_select_own' AND tablename = 'study_plan_generation_jobs') THEN
    CREATE POLICY study_plan_gen_jobs_select_own ON public.study_plan_generation_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'study_plan_gen_jobs_insert_own' AND tablename = 'study_plan_generation_jobs') THEN
    CREATE POLICY study_plan_gen_jobs_insert_own ON public.study_plan_generation_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT ON public.study_plan_generation_jobs TO authenticated;
GRANT ALL ON public.study_plan_generation_jobs TO service_role;
REVOKE ALL ON public.study_plan_generation_jobs FROM anon;

-- Adjustment points wallet
CREATE TABLE IF NOT EXISTS public.study_plan_adjustment_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  lifetime_earned integer NOT NULL DEFAULT 0,
  lifetime_spent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.study_plan_adjustment_wallets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'study_plan_wallets_select_own' AND tablename = 'study_plan_adjustment_wallets') THEN
    CREATE POLICY study_plan_wallets_select_own ON public.study_plan_adjustment_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT ON public.study_plan_adjustment_wallets TO authenticated;
GRANT ALL ON public.study_plan_adjustment_wallets TO service_role;
REVOKE ALL ON public.study_plan_adjustment_wallets FROM anon;

-- Adjustment point transactions
CREATE TABLE IF NOT EXISTS public.study_plan_adjustment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid,
  type text NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_plan_adj_txn_type_check'
      AND conrelid = 'public.study_plan_adjustment_transactions'::regclass
  ) THEN
    ALTER TABLE public.study_plan_adjustment_transactions
      ADD CONSTRAINT study_plan_adj_txn_type_check
      CHECK (type IN ('earn', 'spend', 'refund', 'bonus'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_plan_adj_txn_idempotency_unique'
      AND conrelid = 'public.study_plan_adjustment_transactions'::regclass
  ) THEN
    ALTER TABLE public.study_plan_adjustment_transactions
      ADD CONSTRAINT study_plan_adj_txn_idempotency_unique
      UNIQUE (idempotency_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_study_plan_adj_txn_user ON public.study_plan_adjustment_transactions(user_id, created_at DESC);

ALTER TABLE public.study_plan_adjustment_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'study_plan_adj_txn_select_own' AND tablename = 'study_plan_adjustment_transactions') THEN
    CREATE POLICY study_plan_adj_txn_select_own ON public.study_plan_adjustment_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT ON public.study_plan_adjustment_transactions TO authenticated;
GRANT ALL ON public.study_plan_adjustment_transactions TO service_role;
REVOKE ALL ON public.study_plan_adjustment_transactions FROM anon;

-- RPC: Award adjustment points
CREATE OR REPLACE FUNCTION public.award_adjustment_points(
  p_user_id uuid, p_task_id uuid, p_task_type text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_amount integer;
  v_balance integer;
  v_wallet_exists boolean;
  v_today_earned integer;
  v_daily_cap integer := 4;
BEGIN
  v_amount := CASE
    WHEN p_task_type IN ('task1', 'task2') THEN 2
    WHEN p_task_type = 'full_test' THEN 3
    ELSE 1
  END;

  SELECT COALESCE(SUM(amount), 0) INTO v_today_earned
  FROM public.study_plan_adjustment_transactions
  WHERE user_id = p_user_id AND type = 'earn' AND created_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Shanghai');

  IF v_today_earned >= v_daily_cap THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'daily_cap', 'amount', 0);
  END IF;

  IF v_today_earned + v_amount > v_daily_cap THEN
    v_amount := v_daily_cap - v_today_earned;
  END IF;

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'daily_cap', 'amount', 0);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.study_plan_adjustment_wallets WHERE user_id = p_user_id) INTO v_wallet_exists;
  IF NOT v_wallet_exists THEN
    INSERT INTO public.study_plan_adjustment_wallets (user_id, balance, lifetime_earned, lifetime_spent) VALUES (p_user_id, 0, 0, 0);
  END IF;

  UPDATE public.study_plan_adjustment_wallets
  SET balance = balance + v_amount, lifetime_earned = lifetime_earned + v_amount, updated_at = now()
  WHERE user_id = p_user_id RETURNING balance INTO v_balance;

  INSERT INTO public.study_plan_adjustment_transactions (user_id, task_id, type, amount, reason, idempotency_key, balance_after)
  VALUES (p_user_id, p_task_id, 'earn', v_amount, 'task_completed:' || p_task_type, p_idempotency_key, v_balance);

  RETURN jsonb_build_object('awarded', true, 'amount', v_amount, 'balance', v_balance);
EXCEPTION
  WHEN unique_violation THEN
    SELECT balance INTO v_balance FROM public.study_plan_adjustment_wallets WHERE user_id = p_user_id;
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_awarded', 'amount', 0, 'balance', COALESCE(v_balance, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_adjustment_points(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.award_adjustment_points(uuid, uuid, text, text) FROM public, anon, authenticated;

-- RPC: Spend adjustment points
CREATE OR REPLACE FUNCTION public.spend_adjustment_points(
  p_user_id uuid, p_amount integer, p_reason text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_AMOUNT'; END IF;
  SELECT balance INTO v_balance FROM public.study_plan_adjustment_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WALLET_NOT_FOUND'; END IF;
  IF v_balance < p_amount THEN RETURN jsonb_build_object('success', false, 'reason', 'insufficient_balance', 'balance', v_balance); END IF;
  v_new_balance := v_balance - p_amount;
  UPDATE public.study_plan_adjustment_wallets SET balance = v_new_balance, lifetime_spent = lifetime_spent + p_amount, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.study_plan_adjustment_transactions (user_id, type, amount, reason, idempotency_key, balance_after) VALUES (p_user_id, 'spend', p_amount, p_reason, p_idempotency_key, v_new_balance);
  RETURN jsonb_build_object('success', true, 'spent', p_amount, 'balance', v_new_balance);
EXCEPTION
  WHEN unique_violation THEN
    SELECT balance INTO v_balance FROM public.study_plan_adjustment_wallets WHERE user_id = p_user_id;
    RETURN jsonb_build_object('success', true, 'spent', p_amount, 'balance', COALESCE(v_balance, 0), 'already_spent', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.spend_adjustment_points(uuid, integer, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.spend_adjustment_points(uuid, integer, text, text) FROM public, anon, authenticated;

-- RPC: Refund adjustment points
CREATE OR REPLACE FUNCTION public.refund_adjustment_points(
  p_user_id uuid, p_amount integer, p_reason text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_balance integer;
BEGIN
  UPDATE public.study_plan_adjustment_wallets SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_user_id RETURNING balance INTO v_balance;
  INSERT INTO public.study_plan_adjustment_transactions (user_id, type, amount, reason, idempotency_key, balance_after) VALUES (p_user_id, 'refund', p_amount, p_reason, p_idempotency_key, v_balance);
  RETURN jsonb_build_object('success', true, 'balance', v_balance);
EXCEPTION
  WHEN unique_violation THEN RETURN jsonb_build_object('success', true, 'already_refunded', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_adjustment_points(uuid, integer, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.refund_adjustment_points(uuid, integer, text, text) FROM public, anon, authenticated;
