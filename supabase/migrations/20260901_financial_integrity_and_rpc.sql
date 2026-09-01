-- =============================================================================
-- MIGRATION: 20260901_financial_integrity_and_rpc.sql
-- SKYBIRD 3D CRASH GAME - INTEGRIDADE FINANCEIRA E MÁQUINA DE ESTADOS
-- =============================================================================

-- 1. TABELA DE IDEMPOTÊNCIA PARA APOSTAS E TRANSAÇÕES
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_type TEXT NOT NULL, -- 'place_bet', 'cashout_bet'
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_idempotency UNIQUE (user_id, idempotency_key)
);

-- Habilitar RLS na tabela de idempotência
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Utilizadores podem consultar as suas chaves de idempotência" ON public.idempotency_keys;

CREATE POLICY "Utilizadores podem consultar as suas chaves de idempotência"
  ON public.idempotency_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. VALIDAÇÃO DE RESTRIÇÃO DE ESTADO NAS RODADAS (GAME_ROUNDS)
ALTER TABLE public.game_rounds 
  DROP CONSTRAINT IF EXISTS chk_round_status;

ALTER TABLE public.game_rounds 
  ADD CONSTRAINT chk_round_status 
  CHECK (status IN ('WAITING', 'COUNTDOWN', 'RUNNING', 'CRASHED', 'SETTLED'));

-- 3. RPC PLACE_BET ATÓMICA E AUTORITÁRIA NO POSTGRESQL
CREATE OR REPLACE FUNCTION public.place_bet(
  p_round_id TEXT,
  p_amount NUMERIC,
  p_panel_id INT DEFAULT 1,
  p_auto_cashout NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_wallet_balance NUMERIC;
  v_round_status TEXT;
  v_round_number INT;
  v_bet_id UUID;
  v_tx_id UUID;
  v_existing_response JSONB;
  v_idempotency_str TEXT;
BEGIN
  -- 1. Obter utilizador autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Utilizador não autenticado.';
  END IF;

  -- 2. Validar valor da aposta
  IF p_amount IS NULL OR p_amount < 0.50 OR p_amount > 5000.00 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Valor da aposta fora dos limites permitidos ($0.50 - $5000.00).';
  END IF;

  -- 3. Verificar Idempotência no Banco de Dados
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    v_idempotency_str := TRIM(p_idempotency_key);
    SELECT response_payload INTO v_existing_response
    FROM public.idempotency_keys
    WHERE user_id = v_user_id AND idempotency_key = v_idempotency_str;

    IF v_existing_response IS NOT NULL THEN
      RETURN v_existing_response;
    END IF;
  END IF;

  -- 4. Bloquear e Verificar Estado da Rodada (compatível com IDs text / uuid)
  SELECT status, round_number INTO v_round_status, v_round_number
  FROM public.game_rounds
  WHERE id::text = p_round_id OR id::text = 'rnd_' || p_round_id OR round_number::text = p_round_id;

  IF v_round_status IS NULL THEN
    v_round_number := COALESCE(NULLIF(regexp_replace(p_round_id, '\D', '', 'g'), '')::INT, 1000);
    INSERT INTO public.game_rounds (id, round_number, status, server_seed_hash, client_seed, started_at)
    VALUES (
      p_round_id,
      v_round_number,
      'COUNTDOWN',
      encode(digest(p_round_id || '_seed', 'sha256'), 'hex'),
      'skybird_client_seed_main',
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

    SELECT status, round_number INTO v_round_status, v_round_number
    FROM public.game_rounds
    WHERE id::text = p_round_id OR id::text = 'rnd_' || p_round_id OR round_number::text = p_round_id;

    IF v_round_status IS NULL THEN
      v_round_status := 'COUNTDOWN';
      v_round_number := v_round_number;
    END IF;
  END IF;

  IF v_round_status NOT IN ('WAITING', 'COUNTDOWN') THEN
    RAISE EXCEPTION 'BETTING_CLOSED: Aposta rejeitada. Janela de apostas encerrada para a rodada #%.', v_round_number;
  END IF;

  -- 5. Bloquear Wallet do Utilizador com SELECT ... FOR UPDATE (Atómico)
  SELECT available_balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Carteira do utilizador não encontrada.';
  END IF;

  IF v_wallet_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente. Saldo disponível: $%, Solicitado: $%.', v_wallet_balance, p_amount;
  END IF;

  -- 6. Verificar se já existe aposta ativa neste painel para a mesma rodada
  IF EXISTS (
    SELECT 1 FROM public.bets 
    WHERE user_id = v_user_id AND round_id::text = p_round_id AND panel_id = p_panel_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_BET: Já possui uma aposta ativa no painel % para esta rodada.', p_panel_id;
  END IF;

  -- 7. Executar Operação Financeira (Debitar Wallet)
  UPDATE public.wallets
  SET available_balance = available_balance - p_amount,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 8. Registar Aposta
  v_bet_id := gen_random_uuid();
  INSERT INTO public.bets (
    id, round_id, user_id, amount, auto_cashout, status, panel_id, created_at
  ) VALUES (
    v_bet_id, p_round_id::text, v_user_id, p_amount, p_auto_cashout, 'active', p_panel_id, NOW()
  );

  -- 9. Registar Transação no Ledger Financial
  v_tx_id := gen_random_uuid();
  INSERT INTO public.transactions (
    id, user_id, type, amount, currency, balance_before, balance_after, reference, status, created_at
  ) VALUES (
    v_tx_id, v_user_id, 'bet_placed', p_amount, 'USD', v_wallet_balance, (v_wallet_balance - p_amount),
    'BET-' || v_round_number || '-P' || p_panel_id, 'completed', NOW()
  );

  -- 10. Construir Payload de Sucesso
  v_existing_response := jsonb_build_object(
    'success', true,
    'bet_id', v_bet_id,
    'transaction_id', v_tx_id,
    'balance_before', v_wallet_balance,
    'balance_after', (v_wallet_balance - p_amount),
    'round_number', v_round_number,
    'panel_id', p_panel_id
  );

  -- 11. Salvar Idempotency Key se fornecida
  IF v_idempotency_str IS NOT NULL THEN
    INSERT INTO public.idempotency_keys (user_id, idempotency_key, request_type, response_payload)
    VALUES (v_user_id, v_idempotency_str, 'place_bet', v_existing_response);
  END IF;

  RETURN v_existing_response;
END;
$$;


-- 4. RPC CASHOUT_BET ATÓMICA E AUTORITÁRIA NO POSTGRESQL
CREATE OR REPLACE FUNCTION public.cashout_bet(
  p_bet_id TEXT,
  p_multiplier NUMERIC,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_bet_user_id UUID;
  v_bet_amount NUMERIC;
  v_bet_status TEXT;
  v_round_id_text TEXT;
  v_round_status TEXT;
  v_round_number INT;
  v_crash_point NUMERIC;
  v_started_at TIMESTAMPTZ;
  v_authorized_multiplier NUMERIC;
  v_payout NUMERIC;
  v_wallet_balance NUMERIC;
  v_tx_id UUID;
  v_existing_response JSONB;
  v_idempotency_str TEXT;
BEGIN
  -- 1. Autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Utilizador não autenticado.';
  END IF;

  -- 2. Verificar Idempotência
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    v_idempotency_str := TRIM(p_idempotency_key);
    SELECT response_payload INTO v_existing_response
    FROM public.idempotency_keys
    WHERE user_id = v_user_id AND idempotency_key = v_idempotency_str;

    IF v_existing_response IS NOT NULL THEN
      RETURN v_existing_response;
    END IF;
  END IF;

  -- 3. Bloquear e Validar a Aposta com SELECT ... FOR UPDATE (Impede Duplo Cashout)
  SELECT user_id, amount, status, round_id::text
  INTO v_bet_user_id, v_bet_amount, v_bet_status, v_round_id_text
  FROM public.bets
  WHERE id::text = p_bet_id
  FOR UPDATE;

  IF v_bet_user_id IS NULL THEN
    RAISE EXCEPTION 'BET_NOT_FOUND: Aposta não encontrada.';
  END IF;

  IF v_bet_user_id <> v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Esta aposta não pertence ao utilizador atual.';
  END IF;

  IF v_bet_status <> 'active' THEN
    RAISE EXCEPTION 'BET_NOT_ACTIVE: Aposta já foi liquidada ou cancelada.';
  END IF;

  -- 4. Bloquear e Validar a Rodada no Servidor
  SELECT status, crash_point, round_number, started_at
  INTO v_round_status, v_crash_point, v_round_number, v_started_at
  FROM public.game_rounds
  WHERE id::text = v_round_id_text
  FOR UPDATE;

  -- REGRA DE OURO DA CORRIDA: Se a rodada já caiu (CRASHED), o cashout é REJEITADO
  IF v_round_status <> 'RUNNING' THEN
    RAISE EXCEPTION 'ROUND_ENDED: O voo da rodada #% já foi encerrado ou caiu.', v_round_number;
  END IF;

  -- 5. Multiplicador Autorizado pelo Servidor (Não confia cegamente no client)
  v_authorized_multiplier := LEAST(p_multiplier, v_crash_point);

  IF v_authorized_multiplier <= 1.00 THEN
    v_authorized_multiplier := 1.00;
  END IF;

  IF p_multiplier > v_crash_point THEN
    RAISE EXCEPTION 'CRASHED_EXCEEDED: Tentativa de cashout superior ao ponto de crash autorizado (Solicitado: %, Crash: %).', p_multiplier, v_crash_point;
  END IF;

  -- 6. Calcular Payout Monetário
  v_payout := ROUND(v_bet_amount * v_authorized_multiplier, 2);

  -- 7. Bloquear Wallet e Creditar Payout
  SELECT available_balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  UPDATE public.wallets
  SET available_balance = available_balance + v_payout,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 8. Atualizar Estado da Aposta
  UPDATE public.bets
  SET status = 'cashed_out',
      cashout_multiplier = v_authorized_multiplier,
      payout = v_payout,
      updated_at = NOW()
  WHERE id::text = p_bet_id;

  -- 9. Inserir Transação no Ledger Financial
  v_tx_id := gen_random_uuid();
  INSERT INTO public.transactions (
    id, user_id, type, amount, currency, balance_before, balance_after, reference, status, created_at
  ) VALUES (
    v_tx_id, v_user_id, 'bet_cashed_out', v_payout, 'USD', v_wallet_balance, (v_wallet_balance + v_payout),
    'CASHOUT-' || v_round_number || '-' || v_authorized_multiplier || 'X', 'completed', NOW()
  );

  -- 10. Resposta Confirmada Server-Side
  v_existing_response := jsonb_build_object(
    'success', true,
    'payout', v_payout,
    'multiplier', v_authorized_multiplier,
    'balance_after', (v_wallet_balance + v_payout),
    'transaction_id', v_tx_id,
    'bet_id', p_bet_id
  );

  IF v_idempotency_str IS NOT NULL THEN
    INSERT INTO public.idempotency_keys (user_id, idempotency_key, request_type, response_payload)
    VALUES (v_user_id, v_idempotency_str, 'cashout_bet', v_existing_response);
  END IF;

  RETURN v_existing_response;
END;
$$;
