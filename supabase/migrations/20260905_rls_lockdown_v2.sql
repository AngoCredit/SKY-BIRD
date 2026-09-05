-- SKY-BIRD RLS LOCKDOWN V2
-- Designed for the live schema audited on 2026-09-05.
-- This migration is intentionally separate from the financial RPC migration.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles
     WHERE id = auth.uid()
       AND role = 'admin'
       AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Remove known permissive policies. The DROP loops below also remove policies
-- introduced under different names, making this safe against policy-name drift.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname='public'
       AND tablename IN (
         'admin_settings','audit_logs','bets','game_rounds','idempotency_keys',
         'kyc_verifications','profiles','support_conversations','support_messages',
         'transactions','wallets'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',r.policyname,r.schemaname,r.tablename);
  END LOOP;
END $$;

-- Profiles: authenticated users can read their own profile; admins can read all.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own_or_admin
ON public.profiles FOR SELECT TO authenticated
USING (id=auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own
ON public.profiles FOR UPDATE TO authenticated
USING (id=auth.uid())
WITH CHECK (id=auth.uid());

CREATE POLICY profiles_admin_update
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Wallets: users may read only their own wallet. All writes go through RPCs.
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallets_select_own_or_admin
ON public.wallets FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_admin());

-- Transactions: private to owner/admin; immutable from the browser.
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_select_own_or_admin
ON public.transactions FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_admin());

-- Bets: private to owner/admin; mutations go through server RPCs.
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY bets_select_own_or_admin
ON public.bets FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_admin());

-- Game rounds: browser must use get_current_round()/reveal_round_seed().
-- No direct table SELECT prevents accidental exposure of server_seed.
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;

-- Idempotency records are private and written only by place_bet().
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY idempotency_select_own
ON public.idempotency_keys FOR SELECT TO authenticated
USING (user_id=auth.uid());

-- Admin settings: authenticated users can read operational settings.
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_settings_select_authenticated
ON public.admin_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY admin_settings_admin_write
ON public.admin_settings FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Audit logs: admin only.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_admin_only
ON public.audit_logs FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- KYC: owner can submit/read own record; only admin can modify/review.
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY kyc_select_own_or_admin
ON public.kyc_verifications FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_admin());

CREATE POLICY kyc_insert_own
ON public.kyc_verifications FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid());

CREATE POLICY kyc_admin_update
ON public.kyc_verifications FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Support conversations: owner/admin access.
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_conversations_select_owner_or_admin
ON public.support_conversations FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_admin());

CREATE POLICY support_conversations_insert_owner
ON public.support_conversations FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid());

CREATE POLICY support_conversations_admin_update
ON public.support_conversations FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Support messages: player may insert as themselves; reads limited to a
-- conversation they own or admin. Sender identity must equal auth.uid().
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_messages_select_owner_or_admin
ON public.support_messages FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.support_conversations c
     WHERE c.id=conversation_id AND c.user_id=auth.uid()
  )
);

CREATE POLICY support_messages_insert_self
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (sender_id=auth.uid());

CREATE POLICY support_messages_admin_update
ON public.support_messages FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Direct financial/game DML is forbidden to browser roles even if a future
-- policy is accidentally added. SECURITY DEFINER RPCs remain able to mutate.
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_rounds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.idempotency_keys FROM anon, authenticated;

-- Do not grant direct game_rounds SELECT; safe RPC is the public interface.
REVOKE SELECT ON public.game_rounds FROM anon, authenticated;

-- Remove redundant wallet index; PRIMARY KEY(user_id) already indexes it.
DROP INDEX IF EXISTS public.idx_wallets_user_id;
