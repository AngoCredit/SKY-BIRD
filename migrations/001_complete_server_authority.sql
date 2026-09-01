-- =============================================================================
-- SKYBIRD 3D CRASH GAME — MIGRATION 001: SERVER AUTHORITY COMPLETE
-- Aplique este ficheiro no SQL Editor do Supabase Dashboard em sequência.
-- =============================================================================

-- =========================================================
-- SECÇÃO 1: UNIQUE CONSTRAINT NA TABELA BETS (Idempotência)
-- Impede apostas duplicadas do mesmo utilizador na mesma rodada.
-- =========================================================

ALTER TABLE public.bets
  DROP CONSTRAINT IF EXISTS bets_unique_user_round;

ALTER TABLE public.bets
  ADD CONSTRAINT bets_unique_user_round
  UNIQUE (user_id, round_id, panel_id);

-- Se panel_id pode ser NULL, usar partial unique index como alternativa
-- (manter o constraint acima se panel_id NOT NULL, senão usar o índice abaixo)
-- CREATE UNIQUE INDEX IF NOT EXISTS bets_unique_user_round_panel
--   ON public.bets(user_id, round_id, panel_id);

-- =========================================================
-- SECÇÃO 2: FUNÇÃO AUXILIAR PARA ARREDONDAMENTO MONETÁRIO
-- Substitui a referência inválida a Math_round_currency
-- =========================================================

CREATE OR REPLACE FUNCTION public.round_money(val NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN ROUND(val::numeric, 2);
END;
$$;

-- =========================================================
-- SECÇÃO 3: CORRIGIR handle_new_user (TRIGGER COMPLETO)
-- A versão anterior estava truncada/incompleta sem END $$.
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Criar registo em public.profiles
  INSERT INTO public.profiles (
    id,
    name,
    email,
    avatar_url,
    role,
    status,
    is_verified,
    verification_status,
    created_at,
    last_login_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text
    ),
    COALESCE(NEW.raw_user_meta_data->>'role', 'player'),
    'active',
    FALSE,
    'unverified',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    last_login_at = NOW(),
    -- Só actualiza avatar se veio nos metadados e o campo ainda é o padrão
    avatar_url = CASE
      WHEN NEW.raw_user_meta_data->>'avatar_url' IS NOT NULL
        THEN NEW.raw_user_meta_data->>'avatar_url'
      ELSE profiles.avatar_url
    END;

  -- 2. Criar carteira do utilizador com saldo zero
  INSERT INTO public.wallets (
    user_id,
    available_balance,
    locked_balance,
    currency,
    updated_at
  ) VALUES (
    NEW.id,
    0.00,
    0.00,
    'USD',
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Remover trigger anterior se existir e recriar
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- SECÇÃO 4: RECONSTRUIR place_bet — OPERAÇÃO ATÓMICA
-- Todas as validações e mutações em única transação PostgreSQL.
-- O frontend NÃO pode executar UPDATE na wallet directamente.
-- =========================================================

CREATE OR REPLACE FUNCTION public.place_bet(
  p_round_id UUID,
  p_amount   NUMERIC(10,2),
  p_panel_id INT DEFAULT 1,
  p_auto_cashout NUMERIC(8,2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID;
  v_wallet        RECORD;
  v_round         RECORD;
  v_settings      RECORD;
  v_bet_id        UUID;
  v_tx_id         UUID;
  v_balance_before NUMERIC(12,2);
  v_balance_after  NUMERIC(12,2);
  v_existing_bet   UUID;
BEGIN
  -- A. Validar autenticação (nunca aceitar user_id do frontend)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Utilizador não autenticado.' USING ERRCODE = 'P0001';
  END IF;

  -- B. Validar rodada existente e status (WAITING = apostas abertas)
  SELECT * INTO v_round
    FROM public.game_rounds
    WHERE id = p_round_id
    FOR UPDATE;  -- Bloquear para evitar race condition no status da rodada

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: Rodada não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_round.status != 'WAITING' THEN
    RAISE EXCEPTION 'ROUND_CLOSED: Apostas encerradas. Status: %', v_round.status USING ERRCODE = 'P0003';
  END IF;

  -- C. Validar limites configurados
  SELECT * INTO v_settings FROM public.admin_settings WHERE id = 1;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Valor deve ser positivo.' USING ERRCODE = 'P0004';
  END IF;

  IF v_settings.game_enabled = FALSE THEN
    RAISE EXCEPTION 'GAME_DISABLED: O jogo está desativado pelo administrador.' USING ERRCODE = 'P0005';
  END IF;

  IF p_amount < v_settings.min_bet THEN
    RAISE EXCEPTION 'BELOW_MIN_BET: Aposta mínima é de $% USD', v_settings.min_bet USING ERRCODE = 'P0006';
  END IF;

  IF p_amount > v_settings.max_bet THEN
    RAISE EXCEPTION 'ABOVE_MAX_BET: Aposta máxima é de $% USD', v_settings.max_bet USING ERRCODE = 'P0007';
  END IF;

  -- D. Verificar aposta duplicada na mesma rodada e painel (constraint de BD é suficiente,
  --    mas verificamos antes para mensagem de erro mais clara)
  SELECT id INTO v_existing_bet
    FROM public.bets
    WHERE user_id = v_user_id
      AND round_id = p_round_id
      AND panel_id = p_panel_id
      AND status = 'active';

  IF FOUND THEN
    RAISE EXCEPTION 'DUPLICATE_BET: Já existe aposta activa no painel % desta rodada.', p_panel_id USING ERRCODE = 'P0008';
  END IF;

  -- E. Bloquear carteira com SELECT FOR UPDATE (previne double-spend concorrente)
  SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Carteira não encontrada.' USING ERRCODE = 'P0009';
  END IF;

  v_balance_before := v_wallet.available_balance;

  -- F. Validar saldo suficiente
  IF v_balance_before < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Saldo disponível $%. Aposta pedida $%.', v_balance_before, p_amount USING ERRCODE = 'P0010';
  END IF;

  -- G. Debitar carteira
  v_balance_after := public.round_money(v_balance_before - p_amount);

  UPDATE public.wallets
    SET available_balance = v_balance_after,
        updated_at = NOW()
    WHERE user_id = v_user_id;

  -- H. Criar aposta
  INSERT INTO public.bets (
    round_id,
    user_id,
    amount,
    auto_cashout_multiplier,
    status,
    panel_id,
    is_bot,
    created_at
  ) VALUES (
    p_round_id,
    v_user_id,
    p_amount,
    p_auto_cashout,
    'active',
    p_panel_id,
    FALSE,
    NOW()
  )
  RETURNING id INTO v_bet_id;

  -- I. Registar transação no ledger financeiro
  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    currency,
    balance_before,
    balance_after,
    reference,
    status,
    method,
    details,
    created_at
  ) VALUES (
    v_user_id,
    'bet',
    p_amount,
    'USD',
    v_balance_before,
    v_balance_after,
    'BET-RND-' || v_round.round_number || '-P' || p_panel_id,
    'completed',
    'System',
    'Aposta realizada via RPC server-side no painel #' || p_panel_id,
    NOW()
  )
  RETURNING id INTO v_tx_id;

  -- J. Atualizar totais da rodada
  UPDATE public.game_rounds
    SET total_bets_amount = total_bets_amount + p_amount
    WHERE id = p_round_id;

  -- K. Retornar resultado servidor (o frontend usa este JSON — nunca calcula payout local)
  RETURN jsonb_build_object(
    'success',         TRUE,
    'bet_id',          v_bet_id,
    'transaction_id',  v_tx_id,
    'balance_before',  v_balance_before,
    'balance_after',   v_balance_after,
    'round_number',    v_round.round_number,
    'panel_id',        p_panel_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Garantir rollback total em qualquer falha
    RAISE;
END;
$$;

-- =========================================================
-- SECÇÃO 5: RECONSTRUIR cashout_bet — OPERAÇÃO ATÓMICA
-- Corrigido: Math_round_currency → ROUND(..., 2)
-- =========================================================

CREATE OR REPLACE FUNCTION public.cashout_bet(
  p_bet_id     UUID,
  p_multiplier NUMERIC(8,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_bet            RECORD;
  v_round          RECORD;
  v_wallet         RECORD;
  v_payout         NUMERIC(12,2);
  v_balance_before NUMERIC(12,2);
  v_balance_after  NUMERIC(12,2);
  v_tx_id          UUID;
  v_max_payout     NUMERIC(12,2);
BEGIN
  -- A. Validar autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Utilizador não autenticado.' USING ERRCODE = 'P0001';
  END IF;

  -- B. Bloquear aposta (FOR UPDATE previne cashout duplo simultâneo)
  SELECT * INTO v_bet
    FROM public.bets
    WHERE id = p_bet_id
      AND user_id = v_user_id  -- Garantir que a aposta pertence ao utilizador autenticado
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BET_NOT_FOUND: Aposta não encontrada ou não pertence ao utilizador.' USING ERRCODE = 'P0011';
  END IF;

  -- C. Validar estado da aposta (idempotência: rejeitar cashout duplo)
  IF v_bet.status = 'cashed_out' THEN
    RAISE EXCEPTION 'ALREADY_CASHED_OUT: Esta aposta já foi sacada.' USING ERRCODE = 'P0012';
  END IF;

  IF v_bet.status = 'crashed' THEN
    RAISE EXCEPTION 'BET_CRASHED: O avião caiu antes do cashout.' USING ERRCODE = 'P0013';
  END IF;

  IF v_bet.status != 'active' THEN
    RAISE EXCEPTION 'BET_INVALID_STATUS: Estado inválido da aposta: %', v_bet.status USING ERRCODE = 'P0014';
  END IF;

  -- D. Validar multiplicador mínimo
  IF p_multiplier < 1.01 THEN
    RAISE EXCEPTION 'INVALID_MULTIPLIER: Multiplicador mínimo é 1.01x.' USING ERRCODE = 'P0015';
  END IF;

  -- E. Obter e validar rodada
  SELECT * INTO v_round
    FROM public.game_rounds
    WHERE id = v_bet.round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: Rodada associada não encontrada.' USING ERRCODE = 'P0016';
  END IF;

  -- F. Validar se o multiplicador pedido não excede o crash_point REAL do servidor
  --    O frontend NÃO determina o resultado — apenas envia o multiplicador pedido.
  --    O servidor valida contra o crash_point real.
  IF v_round.status = 'CRASHED' THEN
    -- Rodada já terminou: marcar como crashed
    UPDATE public.bets SET status = 'crashed' WHERE id = p_bet_id;
    RAISE EXCEPTION 'ROUND_CRASHED: O avião já caiu a %.2fx. Aposta perdida.', v_round.crash_point USING ERRCODE = 'P0017';
  END IF;

  IF p_multiplier > v_round.crash_point THEN
    -- Multiplicador pedido excede o crash real (manipulação de frontend ou timing)
    UPDATE public.bets SET status = 'crashed' WHERE id = p_bet_id;
    RAISE EXCEPTION 'MULTIPLIER_EXCEEDS_CRASH: Multiplicador %.2fx excede crash point %.2fx.', p_multiplier, v_round.crash_point USING ERRCODE = 'P0018';
  END IF;

  -- G. Calcular payout NO SERVIDOR (nunca aceitar payout do frontend)
  SELECT max_payout INTO v_max_payout FROM public.admin_settings WHERE id = 1;
  v_payout := LEAST(
    public.round_money(v_bet.amount * p_multiplier),
    COALESCE(v_max_payout, 25000.00)
  );

  -- H. Bloquear e creditar carteira
  SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

  v_balance_before := v_wallet.available_balance;
  v_balance_after  := public.round_money(v_balance_before + v_payout);

  UPDATE public.wallets
    SET available_balance = v_balance_after,
        updated_at = NOW()
    WHERE user_id = v_user_id;

  -- I. Atualizar aposta para cashed_out
  UPDATE public.bets
    SET status              = 'cashed_out',
        cashout_multiplier  = p_multiplier,
        payout              = v_payout
    WHERE id = p_bet_id;

  -- J. Registar transação de ganho
  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    currency,
    balance_before,
    balance_after,
    reference,
    status,
    method,
    details,
    created_at
  ) VALUES (
    v_user_id,
    'cashout',
    v_payout,
    'USD',
    v_balance_before,
    v_balance_after,
    'WIN-BET-' || p_bet_id,
    'completed',
    'System',
    'Cashout a ' || p_multiplier || 'x — Payout calculado server-side',
    NOW()
  )
  RETURNING id INTO v_tx_id;

  -- K. Atualizar totais da rodada
  UPDATE public.game_rounds
    SET total_payout_amount = total_payout_amount + v_payout
    WHERE id = v_bet.round_id;

  RETURN jsonb_build_object(
    'success',         TRUE,
    'payout',          v_payout,
    'multiplier',      p_multiplier,
    'balance_after',   v_balance_after,
    'transaction_id',  v_tx_id,
    'bet_id',          p_bet_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- =========================================================
-- SECÇÃO 6: CRIAR create_next_round — MOTOR SERVER-SIDE
-- Gera seed, hash SHA-256 e crash_point no PostgreSQL.
-- O crash_point NUNCA é determinado pelo frontend.
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_next_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_number     BIGINT;
  v_server_seed      TEXT;
  v_server_seed_hash TEXT;
  v_client_seed      TEXT := 'skybird_client_seed_main';
  v_nonce            BIGINT;
  v_crash_point      NUMERIC(8,2);
  v_hash_bytes       BYTEA;
  v_hex_val          TEXT;
  v_h                NUMERIC;
  v_e                NUMERIC;
  v_ratio            NUMERIC;
  v_sub_ratio        NUMERIC;
  v_high_ratio       NUMERIC;
  v_house_edge       NUMERIC;
  v_combined         TEXT;
  v_round_id         UUID;
BEGIN
  -- A. Determinar próximo número de rodada
  SELECT COALESCE(MAX(round_number), 0) + 1
    INTO v_round_number
    FROM public.game_rounds;

  v_nonce := v_round_number;

  -- B. Gerar server_seed usando gerador criptográfico do PostgreSQL
  v_server_seed := encode(gen_random_bytes(32), 'hex');

  -- C. Calcular hash SHA-256 do server_seed (para publicação antes da rodada)
  v_server_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');

  -- D. Obter house_edge das configurações
  SELECT house_edge INTO v_house_edge FROM public.admin_settings WHERE id = 1;
  v_house_edge := COALESCE(v_house_edge, 7.5);

  -- E. Calcular crash_point DETERMINÍSTICO baseado na seed (Provably Fair)
  --    Algoritmo: SHA-256(server_seed:client_seed:nonce) → primeiros 13 hex chars → ratio
  v_combined := v_server_seed || ':' || v_client_seed || ':' || v_nonce::text;
  v_hash_bytes := digest(v_combined, 'sha256');
  v_hex_val := encode(v_hash_bytes, 'hex');

  -- Tomar primeiros 13 caracteres hex (52 bits)
  v_hex_val := substring(v_hex_val FROM 1 FOR 13);
  v_h := ('x' || v_hex_val)::bit(52)::bigint::numeric;
  v_e := power(2, 52);
  v_ratio := v_h / v_e;

  -- F. Aplicar distribuição de crash points (compatível com provablyFair.ts)
  IF v_ratio < 0.02 THEN
    -- 2% voos altos (>= 10.00x)
    v_high_ratio := v_ratio / 0.02;
    IF v_high_ratio < 0.10 THEN
      v_crash_point := 45.00 + (1 - v_high_ratio / 0.10) * 55.00;
    ELSE
      v_crash_point := 10.00 + (1 - v_high_ratio) * 34.99;
    END IF;
    v_crash_point := GREATEST(10.00, LEAST(100.00, public.round_money(v_crash_point)));
  ELSE
    -- 98% crashes rápidos (< 10.00x)
    v_sub_ratio := (v_ratio - 0.02) / 0.98;

    -- Verificar instant crash (~24.5% rounds)
    IF v_sub_ratio >= 0.75 OR (v_h::bigint % 5 = 0) THEN
      v_crash_point := 1.00;
    ELSIF v_sub_ratio >= 0.40 THEN
      -- Ultra-fast: 1.01x - 1.50x
      v_crash_point := 1.01 + ((v_sub_ratio - 0.40) / 0.35) * 0.49;
    ELSIF v_sub_ratio >= 0.15 THEN
      -- Fast low: 1.51x - 2.99x
      v_crash_point := 1.51 + ((v_sub_ratio - 0.15) / 0.25) * 1.48;
    ELSIF v_sub_ratio >= 0.04 THEN
      -- Moderate: 3.00x - 6.49x
      v_crash_point := 3.00 + ((v_sub_ratio - 0.04) / 0.11) * 3.49;
    ELSE
      -- High sub-10: 6.50x - 9.99x
      v_crash_point := 6.50 + (v_sub_ratio / 0.04) * 3.49;
    END IF;

    v_crash_point := GREATEST(1.00, LEAST(9.99, public.round_money(v_crash_point)));
  END IF;

  -- G. Criar rodada na tabela (server_seed ainda OCULTO: será revelado após CRASHED)
  INSERT INTO public.game_rounds (
    round_number,
    status,
    crash_point,
    server_seed,
    server_seed_hash,
    client_seed,
    nonce,
    total_bets_amount,
    total_payout_amount,
    created_at
  ) VALUES (
    v_round_number,
    'WAITING',
    v_crash_point,
    v_server_seed,      -- NUNCA exposto ao cliente até CRASHED
    v_server_seed_hash, -- Exposto publicamente antes da rodada
    v_client_seed,
    v_nonce,
    0.00,
    0.00,
    NOW()
  )
  RETURNING id INTO v_round_id;

  RETURN jsonb_build_object(
    'success',           TRUE,
    'round_id',          v_round_id,
    'round_number',      v_round_number,
    'server_seed_hash',  v_server_seed_hash,  -- Apenas hash pública
    'client_seed',       v_client_seed,
    'nonce',             v_nonce,
    'status',            'WAITING'
    -- crash_point e server_seed NÃO são retornados aqui (proteção Provably Fair)
  );
END;
$$;

-- RPC para revelar server_seed após CRASHED (Provably Fair verification)
CREATE OR REPLACE FUNCTION public.reveal_round_seed(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round RECORD;
BEGIN
  SELECT * INTO v_round FROM public.game_rounds WHERE id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada não encontrada.';
  END IF;

  -- Só revelar seed após conclusão da rodada
  IF v_round.status NOT IN ('CRASHED', 'FINISHED') THEN
    RAISE EXCEPTION 'Server seed só é revelado após o encerramento da rodada. Status actual: %', v_round.status;
  END IF;

  RETURN jsonb_build_object(
    'round_id',          v_round.id,
    'round_number',      v_round.round_number,
    'server_seed',       v_round.server_seed,       -- Revelado apenas após CRASHED
    'server_seed_hash',  v_round.server_seed_hash,
    'client_seed',       v_round.client_seed,
    'nonce',             v_round.nonce,
    'crash_point',       v_round.crash_point,
    'status',            v_round.status
  );
END;
$$;

-- =========================================================
-- SECÇÃO 7: CORRIGIR RLS — WALLETS
-- Remover capacidade de UPDATE direto por utilizadores autenticados.
-- Apenas RPCs SECURITY DEFINER podem alterar saldo.
-- =========================================================

-- Revogar permissões directas de escrita na carteira
REVOKE INSERT ON public.wallets FROM authenticated;
REVOKE UPDATE ON public.wallets FROM authenticated;
REVOKE DELETE ON public.wallets FROM authenticated;
REVOKE INSERT ON public.wallets FROM anon;
REVOKE UPDATE ON public.wallets FROM anon;
REVOKE DELETE ON public.wallets FROM anon;

-- Remover policies que permitam escrita directa na wallet por utilizadores
DROP POLICY IF EXISTS "wallet_user_update" ON public.wallets;
DROP POLICY IF EXISTS "Atualizar carteira" ON public.wallets;

-- Manter apenas leitura para utilizadores autenticados (saldo via SELECT)
DROP POLICY IF EXISTS "Leitura de carteira" ON public.wallets;

CREATE POLICY "wallet_read_own"
  ON public.wallets
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =========================================================
-- SECÇÃO 8: CORRIGIR suport_messages policy (WITH CHECK TRUE)
-- Impedir envio de mensagens em nome de outro utilizador.
-- =========================================================

DROP POLICY IF EXISTS "Criar mensagem suporte" ON public.support_messages;

CREATE POLICY "support_msg_insert_own"
  ON public.support_messages
  FOR INSERT
  WITH CHECK (
    -- Utilizadores comuns: sender_id deve ser o próprio auth.uid()
    auth.uid() = sender_id::uuid
    OR
    -- Administradores podem enviar em nome do suporte (sender_id = 'sys_bot' ou próprio id)
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =========================================================
-- SECÇÃO 9: CRIAR BUCKET kyc-documents SE NÃO EXISTIR
-- Nota: buckets são criados via Dashboard ou API de Storage.
-- Este bloco é documentação/referência SQL (execute via API).
--
-- Execute via Supabase JS SDK ou Dashboard:
-- supabase.storage.createBucket('kyc-documents', { public: false })
--
-- Policies de Storage (execute no SQL Editor):
-- =========================================================

-- Policy: Utilizador pode fazer upload dos próprios documentos KYC
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'kyc-documents',
    'kyc-documents',
    FALSE,   -- PRIVATE: acesso controlado por policies
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
ON CONFLICT (id) DO UPDATE
  SET public = FALSE;

-- RLS para Storage Objects (kyc-documents)
CREATE POLICY "kyc_upload_own"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "kyc_read_own_or_admin"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

-- =========================================================
-- SECÇÃO 10: ÍNDICES DE PERFORMANCE ADICIONAIS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_bets_user_round
  ON public.bets(user_id, round_id);

CREATE INDEX IF NOT EXISTS idx_bets_status
  ON public.bets(status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_game_rounds_status
  ON public.game_rounds(status);

CREATE INDEX IF NOT EXISTS idx_game_rounds_round_number
  ON public.game_rounds(round_number DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON public.transactions(user_id, created_at DESC);

-- =========================================================
-- SECÇÃO 11: VALIDAR EXTENSÃO pgcrypto (para gen_random_bytes e digest)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- SECÇÃO 12: POLICY ADICIONAL — profiles INSERT para novos utilizadores
-- O trigger handle_new_user precisa de permissão SECURITY DEFINER,
-- mas garantir que a policy de leitura existe.
-- =========================================================

DROP POLICY IF EXISTS "Inserção de perfil via trigger" ON public.profiles;

CREATE POLICY "profile_insert_via_trigger"
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    -- Apenas o próprio utilizador (via trigger SECURITY DEFINER) pode inserir
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'admin'
    )
  );

-- =========================================================
-- FIM DA MIGRATION 001
-- =========================================================
