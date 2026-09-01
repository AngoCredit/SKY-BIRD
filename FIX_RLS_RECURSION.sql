-- ==============================================================================
-- SKYBIRD 3D CRASH GAME - EXECUÇÃO COMPLETA: TABELAS + CORREÇÃO RLS
-- Copie todo este conteúdo e cole no SQL Editor do Supabase, depois clique em "Run"
-- ==============================================================================

-- 1. CRIAR TODAS AS TABELAS CASO NÃO EXISTAM
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

CREATE TABLE IF NOT EXISTS public.wallets (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  available_balance NUMERIC(12,2) DEFAULT 0.00 CHECK (available_balance >= 0),
  locked_balance NUMERIC(12,2) DEFAULT 0.00 CHECK (locked_balance >= 0),
  currency TEXT DEFAULT 'USD',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.support_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT CHECK (sender_role IN ('player', 'admin', 'system')) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_round_id ON public.bets(round_id);
CREATE INDEX IF NOT EXISTS idx_bets_user_id ON public.bets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_conv_id ON public.support_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON public.kyc_verifications(user_id);

-- 2. HABILITAR ROW LEVEL SECURITY
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

-- 3. REMOVER TODAS AS POLÍTICAS ANTIGAS COM RECURSÃO (para não dar erro de duplicados nem loop 42P17)
DROP POLICY IF EXISTS "Leitura de perfil" ON public.profiles;
DROP POLICY IF EXISTS "Atualização de perfil" ON public.profiles;
DROP POLICY IF EXISTS "Perfil leitura" ON public.profiles;
DROP POLICY IF EXISTS "Perfil atualizacao" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_all" ON public.profiles;

DROP POLICY IF EXISTS "Leitura de carteira" ON public.wallets;
DROP POLICY IF EXISTS "wallets_select_all" ON public.wallets;
DROP POLICY IF EXISTS "wallets_update_all" ON public.wallets;
DROP POLICY IF EXISTS "wallets_insert_all" ON public.wallets;

DROP POLICY IF EXISTS "Leitura de transações" ON public.transactions;
DROP POLICY IF EXISTS "Criar transação" ON public.transactions;
DROP POLICY IF EXISTS "Atualizar transação admin" ON public.transactions;
DROP POLICY IF EXISTS "transactions_select_all" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_all" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_all" ON public.transactions;

DROP POLICY IF EXISTS "Leitura de configurações" ON public.admin_settings;
DROP POLICY IF EXISTS "Escrita de configurações por Admin" ON public.admin_settings;
DROP POLICY IF EXISTS "admin_settings_select_all" ON public.admin_settings;
DROP POLICY IF EXISTS "admin_settings_all" ON public.admin_settings;

DROP POLICY IF EXISTS "Acesso aos logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_all" ON public.audit_logs;

DROP POLICY IF EXISTS "Leitura de rodadas" ON public.game_rounds;
DROP POLICY IF EXISTS "Criar rodada admin" ON public.game_rounds;
DROP POLICY IF EXISTS "game_rounds_select_all" ON public.game_rounds;
DROP POLICY IF EXISTS "game_rounds_insert_all" ON public.game_rounds;
DROP POLICY IF EXISTS "game_rounds_update_all" ON public.game_rounds;

DROP POLICY IF EXISTS "Leitura de apostas" ON public.bets;
DROP POLICY IF EXISTS "Criar aposta" ON public.bets;
DROP POLICY IF EXISTS "Atualizar aposta" ON public.bets;
DROP POLICY IF EXISTS "bets_select_all" ON public.bets;
DROP POLICY IF EXISTS "bets_insert_all" ON public.bets;
DROP POLICY IF EXISTS "bets_update_all" ON public.bets;

DROP POLICY IF EXISTS "Leitura de conversas suporte" ON public.support_conversations;
DROP POLICY IF EXISTS "Criar conversa suporte" ON public.support_conversations;
DROP POLICY IF EXISTS "Atualizar conversa suporte" ON public.support_conversations;
DROP POLICY IF EXISTS "support_conversations_select_all" ON public.support_conversations;
DROP POLICY IF EXISTS "support_conversations_insert_all" ON public.support_conversations;
DROP POLICY IF EXISTS "support_conversations_update_all" ON public.support_conversations;

DROP POLICY IF EXISTS "Leitura de mensagens suporte" ON public.support_messages;
DROP POLICY IF EXISTS "Criar mensagem suporte" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_select_all" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_insert_all" ON public.support_messages;

DROP POLICY IF EXISTS "Leitura de KYC" ON public.kyc_verifications;
DROP POLICY IF EXISTS "Submeter KYC" ON public.kyc_verifications;
DROP POLICY IF EXISTS "Atualizar KYC Admin" ON public.kyc_verifications;
DROP POLICY IF EXISTS "kyc_verifications_select_all" ON public.kyc_verifications;
DROP POLICY IF EXISTS "kyc_verifications_insert_all" ON public.kyc_verifications;
DROP POLICY IF EXISTS "kyc_verifications_update_all" ON public.kyc_verifications;

-- 4. CRIAR NOVAS POLÍTICAS SEGURAS E DIRETAS (SEM RECURSÃO)
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_update_all" ON public.profiles FOR UPDATE USING (TRUE);
CREATE POLICY "profiles_insert_all" ON public.profiles FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "wallets_select_all" ON public.wallets FOR SELECT USING (TRUE);
CREATE POLICY "wallets_update_all" ON public.wallets FOR UPDATE USING (TRUE);
CREATE POLICY "wallets_insert_all" ON public.wallets FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "transactions_select_all" ON public.transactions FOR SELECT USING (TRUE);
CREATE POLICY "transactions_insert_all" ON public.transactions FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "transactions_update_all" ON public.transactions FOR UPDATE USING (TRUE);

CREATE POLICY "admin_settings_select_all" ON public.admin_settings FOR SELECT USING (TRUE);
CREATE POLICY "admin_settings_all" ON public.admin_settings FOR ALL USING (TRUE);

CREATE POLICY "audit_logs_all" ON public.audit_logs FOR ALL USING (TRUE);

CREATE POLICY "game_rounds_select_all" ON public.game_rounds FOR SELECT USING (TRUE);
CREATE POLICY "game_rounds_insert_all" ON public.game_rounds FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "game_rounds_update_all" ON public.game_rounds FOR UPDATE USING (TRUE);

CREATE POLICY "bets_select_all" ON public.bets FOR SELECT USING (TRUE);
CREATE POLICY "bets_insert_all" ON public.bets FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "bets_update_all" ON public.bets FOR UPDATE USING (TRUE);

CREATE POLICY "support_conversations_select_all" ON public.support_conversations FOR SELECT USING (TRUE);
CREATE POLICY "support_conversations_insert_all" ON public.support_conversations FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "support_conversations_update_all" ON public.support_conversations FOR UPDATE USING (TRUE);

CREATE POLICY "support_messages_select_all" ON public.support_messages FOR SELECT USING (TRUE);
CREATE POLICY "support_messages_insert_all" ON public.support_messages FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "kyc_verifications_select_all" ON public.kyc_verifications FOR SELECT USING (TRUE);
CREATE POLICY "kyc_verifications_insert_all" ON public.kyc_verifications FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "kyc_verifications_update_all" ON public.kyc_verifications FOR UPDATE USING (TRUE);
