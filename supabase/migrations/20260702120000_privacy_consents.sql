-- ============================================================
-- Privacy consent tracking for cross-border data transfer
-- ============================================================

CREATE TABLE IF NOT EXISTS public.privacy_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  policy_version text NOT NULL,
  consent_status text NOT NULL DEFAULT 'granted',
  consented_at timestamptz,
  withdrawn_at timestamptz,
  source text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'privacy_consents_type_check'
      AND conrelid = 'public.privacy_consents'::regclass
  ) THEN
    ALTER TABLE public.privacy_consents
      ADD CONSTRAINT privacy_consents_type_check
      CHECK (consent_type IN ('privacy_policy', 'terms', 'cross_border_transfer', 'minor_guardian'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'privacy_consents_status_check'
      AND conrelid = 'public.privacy_consents'::regclass
  ) THEN
    ALTER TABLE public.privacy_consents
      ADD CONSTRAINT privacy_consents_status_check
      CHECK (consent_status IN ('granted', 'withdrawn'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_privacy_consents_user_type
  ON public.privacy_consents(user_id, consent_type, consent_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_consents_active
  ON public.privacy_consents(user_id, consent_type)
  WHERE consent_status = 'granted';

ALTER TABLE public.privacy_consents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'privacy_consents_select_own' AND tablename = 'privacy_consents') THEN
    CREATE POLICY privacy_consents_select_own ON public.privacy_consents FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'privacy_consents_insert_own' AND tablename = 'privacy_consents') THEN
    CREATE POLICY privacy_consents_insert_own ON public.privacy_consents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'privacy_consents_update_own' AND tablename = 'privacy_consents') THEN
    CREATE POLICY privacy_consents_update_own ON public.privacy_consents FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.privacy_consents TO authenticated;
GRANT ALL ON public.privacy_consents TO service_role;
REVOKE ALL ON public.privacy_consents FROM anon;

COMMENT ON TABLE public.privacy_consents IS 'User consent records for privacy policy, terms, and cross-border data transfer';
