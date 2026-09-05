-- SKYBIRD FINAL SECURITY HARDENING
-- Financial authority remains server/database-side. Client receives only safe round data.

BEGIN;

-- Never allow authenticated clients to read secret seed material or pre-crash result.
-- Keep the base table private to trusted server functions and expose a safe view.
DROP VIEW IF EXISTS public.current_round_public;
CREATE VIEW public.current_round_public
WITH (security_invoker = true)
AS
SELECT
  id,
  round_number,
  status,
  started_at,
  ended_at,
  server_seed_hash,
  client_seed,
  nonce,
  total_bets_amount,
  total_payout_amount,
  CASE WHEN status IN ('CRASHED','SETTLED') THEN crash_point ELSE NULL END AS crash_point
FROM public.game_rounds;

REVOKE ALL ON public.current_round_public FROM anon;
GRANT SELECT ON public.current_round_public TO authenticated;

-- Authenticated users must never write financial/game state directly.
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_rounds FROM anon, authenticated;

-- Remove legacy permissive policies if they still exist from the original schema.
DROP POLICY IF EXISTS "Leitura de carteira" ON public.wallets;
DROP POLICY IF EXISTS "Leitura de transações" ON public.transactions;
DROP POLICY IF EXISTS "Criar transação" ON public.transactions;
DROP POLICY IF EXISTS "Atualizar transação admin" ON public.transactions;
DROP POLICY IF EXISTS "Leitura de rodadas" ON public.game_rounds;
DROP POLICY IF EXISTS "Criar rodada admin" ON public.game_rounds;
DROP POLICY IF EXISTS "Leitura de apostas" ON public.bets;
DROP POLICY IF EXISTS "Criar aposta" ON public.bets;
DROP POLICY IF EXISTS "Atualizar aposta" ON public.bets;
DROP POLICY IF EXISTS "Escrita de configurações por Admin" ON public.admin_settings;
DROP POLICY IF EXISTS "Acesso aos logs" ON public.audit_logs;

-- Own-user read policies only.
DROP POLICY IF EXISTS users_select_own_wallet ON public.wallets;
CREATE POLICY users_select_own_wallet
ON public.wallets FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS users_select_own_transactions ON public.transactions;
CREATE POLICY users_select_own_transactions
ON public.transactions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS users_select_own_bets ON public.bets;
CREATE POLICY users_select_own_bets
ON public.bets FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admin settings are readable only; mutation must use trusted server/admin RPCs.
DROP POLICY IF EXISTS "Leitura de configurações" ON public.admin_settings;
CREATE POLICY admin_settings_read
ON public.admin_settings FOR SELECT TO authenticated
USING (true);

-- Audit logs are never writable from the browser.
DROP POLICY IF EXISTS audit_logs_read_admin ON public.audit_logs;
CREATE POLICY audit_logs_read_admin
ON public.audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- Profiles: users may read public profile information but cannot elevate role.
DROP POLICY IF EXISTS "Leitura de perfil" ON public.profiles;
CREATE POLICY profiles_select_authenticated
ON public.profiles FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Atualização de perfil" ON public.profiles;
CREATE POLICY profiles_update_own
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = 'player');

COMMIT;
