-- =============================================================================
-- FINANCIAL LEDGER + RLS REPAIR
-- Repairs permissive policies from the original schema and makes deposits/
-- withdrawals server-authoritative through transaction triggers.
-- =============================================================================

-- Transaction types used by the authoritative bet/cashout RPCs.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (
  type IN ('deposit','withdrawal','bet','bet_placed','cashout','bet_cashed_out','refund','referral_bonus')
);

ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_status_check;
ALTER TABLE public.bets ADD CONSTRAINT bets_status_check CHECK (
  status IN ('active','cashed_out','crashed','lost','cancelled')
);

-- -----------------------------------------------------------------------------
-- Server-authoritative deposit/withdrawal ledger trigger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_financial_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  w NUMERIC;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.type NOT IN ('deposit','withdrawal') THEN
      RAISE EXCEPTION 'DIRECT_FINANCIAL_TRANSACTION_FORBIDDEN';
    END IF;

    SELECT available_balance INTO w FROM public.wallets WHERE user_id=NEW.user_id FOR UPDATE;
    IF w IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

    NEW.currency := COALESCE(NEW.currency,'USD');
    NEW.balance_before := w;

    IF NEW.type='withdrawal' THEN
      IF NEW.amount <= 0 OR w < NEW.amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
      UPDATE public.wallets SET available_balance=w-NEW.amount, updated_at=now() WHERE user_id=NEW.user_id;
      NEW.balance_after := w-NEW.amount;
    ELSE
      -- Deposits remain pending until an authorized admin changes them to completed.
      NEW.balance_after := w;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' THEN
    IF OLD.user_id<>NEW.user_id OR OLD.type<>NEW.type OR OLD.amount<>NEW.amount THEN
      RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_FIELDS';
    END IF;

    IF OLD.status=NEW.status THEN RETURN NEW; END IF;

    SELECT available_balance INTO w FROM public.wallets WHERE user_id=NEW.user_id FOR UPDATE;
    IF w IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

    IF NEW.type='deposit' AND OLD.status='pending' AND NEW.status='completed' THEN
      UPDATE public.wallets SET available_balance=w+NEW.amount, updated_at=now() WHERE user_id=NEW.user_id;
      NEW.balance_before := w;
      NEW.balance_after := w+NEW.amount;
    ELSIF NEW.type='withdrawal' AND OLD.status IN ('pending','processing') AND NEW.status='cancelled' THEN
      UPDATE public.wallets SET available_balance=w+NEW.amount, updated_at=now() WHERE user_id=NEW.user_id;
      NEW.balance_before := w;
      NEW.balance_after := w+NEW.amount;
    END IF;

    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_financial_transaction ON public.transactions;
CREATE TRIGGER trg_apply_financial_transaction
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_financial_transaction();

-- -----------------------------------------------------------------------------
-- Strict RLS. Existing permissive TRUE policies are removed.
-- -----------------------------------------------------------------------------
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('profiles','wallets','transactions','game_rounds','bets','admin_settings','audit_logs','kyc_verifications')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY profiles_select_own_or_admin ON public.profiles FOR SELECT TO authenticated
USING ((select auth.uid())=id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
USING ((select auth.uid())=id) WITH CHECK ((select auth.uid())=id);

-- Wallets
CREATE POLICY wallets_select_own_or_admin ON public.wallets FOR SELECT TO authenticated
USING ((select auth.uid())=user_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));
CREATE POLICY wallets_insert_empty_own ON public.wallets FOR INSERT TO authenticated
WITH CHECK ((select auth.uid())=user_id AND available_balance=0 AND locked_balance=0 AND currency='USD');
CREATE POLICY wallets_update_admin ON public.wallets FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));

-- Transactions: players can create only deposit/withdrawal requests for themselves.
CREATE POLICY tx_select_own_or_admin ON public.transactions FOR SELECT TO authenticated
USING ((select auth.uid())=user_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));
CREATE POLICY tx_insert_own_requests ON public.transactions FOR INSERT TO authenticated
WITH CHECK ((select auth.uid())=user_id AND type IN ('deposit','withdrawal') AND status='pending');
CREATE POLICY tx_update_admin ON public.transactions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));

-- Game rounds: players read public-safe columns only through grants/RPC; no direct mutation.
CREATE POLICY rounds_select_authenticated ON public.game_rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY rounds_admin_update ON public.game_rounds FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));

-- Bets: own history; admins can inspect. No direct player insert/update/delete.
CREATE POLICY bets_select_own_or_admin ON public.bets FOR SELECT TO authenticated
USING ((select auth.uid())=user_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));

-- Admin settings: players can read, only admins can mutate.
CREATE POLICY settings_select_authenticated ON public.admin_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_admin_update ON public.admin_settings FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));

-- Audit log: only admins.
CREATE POLICY audit_admin_only ON public.audit_logs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));

-- KYC: owner may submit/read own request; admins may review.
CREATE POLICY kyc_select_own_or_admin ON public.kyc_verifications FOR SELECT TO authenticated
USING ((select auth.uid())=user_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));
CREATE POLICY kyc_insert_own ON public.kyc_verifications FOR INSERT TO authenticated
WITH CHECK ((select auth.uid())=user_id);
CREATE POLICY kyc_update_admin ON public.kyc_verifications FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='admin'));

-- Never expose anonymous access to financial/game internals.
REVOKE ALL ON public.wallets, public.transactions, public.bets, public.game_rounds, public.audit_logs, public.kyc_verifications FROM anon;

COMMENT ON FUNCTION public.apply_financial_transaction() IS 'Server-authoritative ledger trigger. Client cannot choose balances.';
