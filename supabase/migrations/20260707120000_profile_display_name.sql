-- Add display_name to profiles for persistent user display name
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text;

-- Constraint: 1-20 Unicode characters when not null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_display_name_length'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_display_name_length
      CHECK (display_name IS NULL OR (char_length(trim(display_name)) >= 1 AND char_length(trim(display_name)) <= 20));
  END IF;
END;
$$;

-- Allow authenticated users to update display_name (alongside existing email update)
-- First drop the old restrictive policy
DROP POLICY IF EXISTS "profiles_update_own_email" ON public.profiles;

-- Create new policy that allows updating email and display_name
CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Grant column-level update permission for display_name to authenticated
GRANT UPDATE (email, display_name) ON public.profiles TO authenticated;

COMMENT ON COLUMN public.profiles.display_name IS 'User-chosen display name (1-20 chars). Null means use default.';
