-- ==========================================
-- MIGRATION 002: Correcção Crítica de Sincronização SKYBIRD
-- Execute no SQL Editor do Supabase Dashboard
-- ==========================================

-- 1. Adicionar política INSERT para wallets (estava em falta no schema original)
--    Necessária para que o trigger handle_new_user() possa criar carteiras
--    e o frontend possa criar carteiras quando não existem.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallets' AND policyname = 'Inserir carteira'
  ) THEN
    EXECUTE 'CREATE POLICY "Inserir carteira" ON public.wallets FOR INSERT WITH CHECK (TRUE)';
  END IF;
END $$;

-- 2. Adicionar política UPDATE para wallets (necessária para aprovar depósitos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallets' AND policyname = 'Atualizar carteira'
  ) THEN
    EXECUTE 'CREATE POLICY "Atualizar carteira" ON public.wallets FOR UPDATE USING (TRUE)';
  END IF;
END $$;

-- 3. Adicionar tabela updated_at à transactions se não existir
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Adicionar índice para status de transações (melhora performance do Ledger)
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

-- 5. Garantir que wallets tem índice para user_id
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);

-- 6. Garantir que kyc_verifications tem índice composto para status pending
CREATE INDEX IF NOT EXISTS idx_kyc_status ON public.kyc_verifications(status);

-- 7. Completar o trigger handle_new_user se estiver incompleto (sem END)
-- Verificar se o trigger existe com a estrutura correcta
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id),
    COALESCE(NEW.raw_user_meta_data->>'role', 'player')
  )
  ON CONFLICT (id) DO UPDATE SET
    last_login_at = NOW();

  INSERT INTO public.wallets (user_id, available_balance, locked_balance, currency)
  VALUES (NEW.id, 0.00, 0.00, 'USD')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger se necessário
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Função auxiliar para calcular arredondamento monetário (se não existir)
CREATE OR REPLACE FUNCTION Math_round_currency(val NUMERIC) RETURNS NUMERIC AS $$
BEGIN
  RETURN ROUND(val, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 9. Ativar Realtime para tabelas necessárias
-- NOTA: Execute estes comandos no Dashboard → Database → Replication
-- As tabelas já devem ter Realtime habilitado, mas confirmamos aqui:
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kyc_verifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;

-- ==========================================
-- VERIFICAÇÃO FINAL
-- ==========================================
-- Execute estas queries para verificar o estado:
-- SELECT count(*) FROM public.transactions WHERE status = 'pending';
-- SELECT count(*) FROM public.kyc_verifications WHERE status = 'pending';
-- SELECT * FROM pg_policies WHERE tablename IN ('transactions', 'wallets', 'kyc_verifications');
