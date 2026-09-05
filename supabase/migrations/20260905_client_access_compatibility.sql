-- Keep legitimate zero-balance wallet bootstrap and admin UI compatibility,
-- without allowing normal players to alter money.

DROP POLICY IF EXISTS "users_insert_own_empty_wallet" ON public.wallets;
CREATE POLICY "users_insert_own_empty_wallet"
ON public.wallets FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND COALESCE(available_balance,0) = 0
  AND COALESCE(locked_balance,0) = 0
  AND currency = 'USD'
);

DROP POLICY IF EXISTS "admins_update_wallets" ON public.wallets;
CREATE POLICY "admins_update_wallets"
ON public.wallets FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));

DROP POLICY IF EXISTS "admins_update_transactions" ON public.transactions;
CREATE POLICY "admins_update_transactions"
ON public.transactions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));

DROP POLICY IF EXISTS "admins_select_all_transactions" ON public.transactions;
CREATE POLICY "admins_select_all_transactions"
ON public.transactions FOR SELECT TO authenticated
USING (auth.uid()=user_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));

DROP POLICY IF EXISTS "admins_select_all_bets" ON public.bets;
CREATE POLICY "admins_select_all_bets"
ON public.bets FOR SELECT TO authenticated
USING (auth.uid()=user_id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));

-- Admins need to update only operational metadata; financial mutations remain
-- preferably RPC-driven. This policy is retained only for existing admin screens.
DROP POLICY IF EXISTS "admins_update_bets" ON public.bets;
CREATE POLICY "admins_update_bets"
ON public.bets FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));
