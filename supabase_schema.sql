-- ==========================================
-- ESTRUTURA COMPLETA DE BANCO DE DADOS SUPABASE - SKYBIRD 3D CRASH GAME
-- Copie e cole este código no SQL Editor do Supabase
-- ==========================================

-- 1. Tabela de Perfis de Utilizadores
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  role TEXT CHECK (role IN ('player', 'admin')) DEFAULT 'player',
  status TEXT CHECK (status IN ('active', 'suspended', 'pending')) DEFAULT 'active',
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status TEXT CHECK (verification_status IN ('verified', 'unverified', 'pending')) DEFAULT 'unverified',
  referral_code TEXT UNIQUE,
  referral_count INT DEFAULT 0,
  referral_earnings NUMERIC(12,2) DEFAULT 0.00,
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Carteiras
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  available_balance NUMERIC(12,2) DEFAULT 0.00 CHECK (available_balance >= 0),
  locked_balance NUMERIC(12,2) DEFAULT 0.00 CHECK (locked_balance >= 0),
  currency TEXT DEFAULT 'USD',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Transações Financeiras (Depósitos, Saques, Apostas e Pró-Rata)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('deposit', 'withdrawal', 'bet', 'cashout', 'refund', 'referral_bonus')) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT DEFAULT 'USD',
  balance_before NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  reference TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  method TEXT DEFAULT 'Airtm',
  processing_time_text TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabela de Configurações Administrativas
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id INT PRIMARY KEY DEFAULT 1,
  game_enabled BOOLEAN DEFAULT TRUE,
  maintenance_mode BOOLEAN DEFAULT FALSE,
  min_bet NUMERIC(10,2) DEFAULT 0.50,
  max_bet NUMERIC(10,2) DEFAULT 500.00,
  max_payout NUMERIC(12,2) DEFAULT 25000.00,
  global_rtp NUMERIC(5,2) DEFAULT 92.50,
  house_edge NUMERIC(5,2) DEFAULT 7.50,
  support_status TEXT DEFAULT 'online',
  demo_mode BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.admin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 5. Tabela de Logs de Auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  ip TEXT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabela de Rodadas do Jogo Crash (Game Rounds)
CREATE TABLE IF NOT EXISTS public.game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number BIGINT UNIQUE NOT NULL,
  status TEXT CHECK (status IN ('WAITING', 'RUNNING', 'CRASHED')) DEFAULT 'WAITING',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  crash_point NUMERIC(8,2) NOT NULL,
  server_seed TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  client_seed TEXT DEFAULT 'skybird_client_seed_main',
  nonce BIGINT NOT NULL,
  total_bets_amount NUMERIC(12,2) DEFAULT 0.00,
  total_payout_amount NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tabela de Apostas (Bets)
CREATE TABLE IF NOT EXISTS public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES public.game_rounds(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  auto_cashout_multiplier NUMERIC(8,2),
  cashout_multiplier NUMERIC(8,2),
  payout NUMERIC(12,2),
  status TEXT CHECK (status IN ('active', 'cashed_out', 'crashed')) DEFAULT 'active',
  panel_id INT DEFAULT 1,
  is_bot BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Tabela de Conversas de Suporte (Support Conversations)
CREATE TABLE IF NOT EXISTS public.support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_avatar TEXT,
  status TEXT CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open',
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Tabela de Mensagens de Suporte (Support Messages)
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT CHECK (sender_role IN ('player', 'admin', 'system')) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Tabela de Verificações KYC (Identity Verifications)
CREATE TABLE IF NOT EXISTS public.kyc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  id_document_url TEXT NOT NULL,
  selfie_url TEXT NOT NULL,
  airtm_account TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_round_id ON public.bets(round_id);
CREATE INDEX IF NOT EXISTS idx_bets_user_id ON public.bets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_conv_id ON public.support_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON public.kyc_verifications(user_id);

-- ==========================================
-- POLÍTICAS DE SEGURANÇA (Row Level Security)
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Leitura e atualização gerais
CREATE POLICY "Leitura de perfil" ON public.profiles
  FOR SELECT USING (TRUE);

CREATE POLICY "Atualização de perfil" ON public.profiles
  FOR UPDATE USING (TRUE);

-- Wallets: Leitura e escrita gerais
CREATE POLICY "Leitura de carteira" ON public.wallets
  FOR SELECT USING (TRUE);

-- Transactions: Leitura e criação gerais
CREATE POLICY "Leitura de transações" ON public.transactions
  FOR SELECT USING (TRUE);

CREATE POLICY "Criar transação" ON public.transactions
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Atualizar transação admin" ON public.transactions
  FOR UPDATE USING (TRUE);

-- Admin Settings: Leitura e Escrita
CREATE POLICY "Leitura de configurações" ON public.admin_settings
  FOR SELECT USING (TRUE);

CREATE POLICY "Escrita de configurações por Admin" ON public.admin_settings
  FOR ALL USING (TRUE);

-- Audit Logs: Acesso amplo
CREATE POLICY "Acesso aos logs" ON public.audit_logs
  FOR ALL USING (TRUE);

-- Game Rounds & Bets: Leitura e gestão
CREATE POLICY "Leitura de rodadas" ON public.game_rounds
  FOR SELECT USING (TRUE);

CREATE POLICY "Criar rodada admin" ON public.game_rounds
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Leitura de apostas" ON public.bets
  FOR SELECT USING (TRUE);

CREATE POLICY "Criar aposta" ON public.bets
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Atualizar aposta" ON public.bets
  FOR UPDATE USING (TRUE);

-- Support: Conversas e mensagens acessíveis pelo Painel
CREATE POLICY "Leitura de conversas suporte" ON public.support_conversations
  FOR SELECT USING (TRUE);

CREATE POLICY "Criar conversa suporte" ON public.support_conversations
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Atualizar conversa suporte" ON public.support_conversations
  FOR UPDATE USING (TRUE);

CREATE POLICY "Leitura de mensagens suporte" ON public.support_messages
  FOR SELECT USING (TRUE);

CREATE POLICY "Criar mensagem suporte" ON public.support_messages
  FOR INSERT WITH CHECK (TRUE);

-- KYC: Verificações acessíveis pelo Admin
CREATE POLICY "Leitura de KYC" ON public.kyc_verifications
  FOR SELECT USING (TRUE);

CREATE POLICY "Submeter KYC" ON public.kyc_verifications
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Atualizar KYC Admin" ON public.kyc_verifications
  FOR UPDATE USING (TRUE);

-- Trigger automático para criar carteira e perfil após cadastro no Supabase Auth
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

-- ==========================================
-- STORED PROCEDURES RPC PARA AUTORIDADE FINANCEIRA E CRASH ENGINE SERVER-SIDE
-- ==========================================

-- 1. RPC: place_bet() - Processa aposta de forma atómica com trava de linha (FOR UPDATE)
CREATE OR REPLACE FUNCTION public.place_bet(
  p_round_id UUID,
  p_amount NUMERIC(10,2),
  p_panel_id INT DEFAULT 1,
  p_auto_cashout NUMERIC(8,2) DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_wallet RECORD;
  v_round RECORD;
  v_settings RECORD;
  v_bet_id UUID;
  v_tx_id UUID;
  v_balance_before NUMERIC(12,2);
  v_balance_after NUMERIC(12,2);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado.';
  END IF;

  -- 1. Validar rodada existente e aberta para apostas
  SELECT * INTO v_round FROM public.game_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada não encontrada.';
  END IF;

  IF v_round.status != 'WAITING' THEN
    RAISE EXCEPTION 'Apostas encerradas para esta rodada.';
  END IF;

  -- 2. Validar limites de aposta nas configurações do sistema
  SELECT * INTO v_settings FROM public.admin_settings WHERE id = 1;
  IF p_amount < v_settings.min_bet THEN
    RAISE EXCEPTION 'Aposta mínima é de $% USD', v_settings.min_bet;
  END IF;

  IF p_amount > v_settings.max_bet THEN
    RAISE EXCEPTION 'Aposta máxima é de $% USD', v_settings.max_bet;
  END IF;

  -- 3. Travar carteira do utilizador para evitar apostas simultâneas sem saldo (Double-Spend Prevention)
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Carteira não encontrada.';
  END IF;

  v_balance_before := v_wallet.available_balance;
  IF v_balance_before < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a aposta.';
  END IF;

  v_balance_after := v_balance_before - p_amount;

  -- 4. Debitar saldo da carteira
  UPDATE public.wallets
  SET available_balance = v_balance_after,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 5. Inserir aposta na tabela bets
  INSERT INTO public.bets (
    round_id,
    user_id,
    amount,
    auto_cashout_multiplier,
    status,
    panel_id,
    is_bot
  ) VALUES (
    p_round_id,
    v_user_id,
    p_amount,
    p_auto_cashout,
    'active',
    p_panel_id,
    FALSE
  ) RETURNING id INTO v_bet_id;

  -- 6. Registar transação no ledger
  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    currency,
    balance_before,
    balance_after,
    reference,
    status,
    details
  ) VALUES (
    v_user_id,
    'bet',
    p_amount,
    'USD',
    v_balance_before,
    v_balance_after,
    'BET-ROUND-' || v_round.round_number,
    'completed',
    'Aposta realizada no painel #' || p_panel_id
  ) RETURNING id INTO v_tx_id;

  -- 7. Atualizar totais da rodada
  UPDATE public.game_rounds
  SET total_bets_amount = total_bets_amount + p_amount
  WHERE id = p_round_id;

  RETURN jsonb_build_object(
    'success', true,
    'bet_id', v_bet_id,
    'transaction_id', v_tx_id,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RPC: cashout_bet() - Processa cashout de forma atómica no servidor
CREATE OR REPLACE FUNCTION public.cashout_bet(
  p_bet_id UUID,
  p_multiplier NUMERIC(8,2)
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_bet RECORD;
  v_round RECORD;
  v_wallet RECORD;
  v_payout NUMERIC(12,2);
  v_balance_before NUMERIC(12,2);
  v_balance_after NUMERIC(12,2);
  v_tx_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado.';
  END IF;

  -- 1. Obter e travar aposta
  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aposta não encontrada ou não pertence ao utilizador.';
  END IF;

  IF v_bet.status != 'active' THEN
    RAISE EXCEPTION 'Esta aposta já foi encerrada ou resgatada.';
  END IF;

  -- 2. Obter rodada
  SELECT * INTO v_round FROM public.game_rounds WHERE id = v_bet.round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada associada não encontrada.';
  END IF;

  -- Validar se o multiplicador não excede o crash_point
  IF p_multiplier > v_round.crash_point OR v_round.status = 'CRASHED' THEN
    UPDATE public.bets SET status = 'crashed' WHERE id = p_bet_id;
    RAISE EXCEPTION 'Crash ocorrido antes do cashout.';
  END IF;

  v_payout := Math_round_currency(v_bet.amount * p_multiplier);

  -- 3. Travar carteira e creditar payout
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  v_balance_before := v_wallet.available_balance;
  v_balance_after := v_balance_before + v_payout;

  UPDATE public.wallets
  SET available_balance = v_balance_after,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 4. Atualizar aposta para cashed_out
  UPDATE public.bets
  SET status = 'cashed_out',
      cashout_multiplier = p_multiplier,
      payout = v_payout
  WHERE id = p_bet_id;

  -- 5. Registar transação de ganho no ledger
  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    currency,
    balance_before,
    balance_after,
    reference,
    status,
    details
  ) VALUES (
    v_user_id,
    'cashout',
    v_payout,
    'USD',
    v_balance_before,
    v_balance_after,
    'WIN-BET-' || p_bet_id,
    'completed',
    'Cashout realizado com sucesso a ' || p_multiplier || 'x'
  ) RETURNING id INTO v_tx_id;

  -- 6. Atualizar total de payouts da rodada
  UPDATE public.game_rounds
  SET total_payout_amount = total_payout_amount + v_payout
  WHERE id = v_bet.round_id;

  RETURN jsonb_build_object(
    'success', true,
    'payout', v_payout,
    'multiplier', p_multiplier,
    'balance_after', v_balance_after
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper para arredondar valores monetários a 2 casas decimais
CREATE OR REPLACE FUNCTION Math_round_currency(val NUMERIC) RETURNS NUMERIC AS $$
BEGIN
  RETURN ROUND(val, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Revogar permissões diretas de UPDATE na carteira para utilizadores comuns (Segurança Financeira RLS)
REVOKE UPDATE ON public.wallets FROM authenticated;
REVOKE UPDATE ON public.wallets FROM anon;

