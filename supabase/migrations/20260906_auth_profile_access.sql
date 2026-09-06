-- =============================================================================
-- SKY-BIRD — AUTH PROFILE ACCESS / LOGIN HARDENING
--
-- Provides a stable authenticated profile RPC for the browser. This avoids
-- depending on broad direct SELECT/UPDATE access to public.profiles and is
-- also used by the production admin login bridge.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  role text,
  status text,
  avatar_url text,
  phone text,
  birth_date date,
  is_verified boolean,
  verification_status text,
  referral_code text,
  referral_count integer,
  referral_earnings numeric,
  created_at timestamptz,
  last_login_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    p.name,
    p.email,
    p.role,
    p.status,
    p.avatar_url,
    p.phone,
    p.birth_date,
    p.is_verified,
    p.verification_status,
    p.referral_code,
    p.referral_count,
    p.referral_earnings,
    p.created_at,
    p.last_login_at
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.touch_my_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.profiles
  SET last_login_at = clock_timestamp()
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_my_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_my_login() TO authenticated;

COMMIT;
