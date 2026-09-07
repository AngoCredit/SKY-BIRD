-- =============================================================================
-- SKY-BIRD RLS FIELD PROTECTION
-- Complements 20260905_rls_lockdown_v2.sql.
-- Prevents players from self-promoting or changing verification/status fields.
-- =============================================================================

BEGIN;

-- Player profile updates must never be able to change authorization or
-- verification state. These fields are server/admin controlled.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.is_verified := OLD.is_verified;
    NEW.verification_status := OLD.verification_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_fields();

REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields() FROM PUBLIC, anon, authenticated;

-- A player may request only a pending deposit/withdrawal. The financial ledger
-- trigger controls balance_before/after and wallet locking; admins can use
-- their dedicated admin policies/RPCs for review.
DROP POLICY IF EXISTS transactions_insert_financial_request ON public.transactions;
CREATE POLICY transactions_insert_financial_request
ON public.transactions FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND type IN ('deposit','withdrawal')
    AND status = 'pending'
    AND amount > 0
  )
);

COMMIT;
