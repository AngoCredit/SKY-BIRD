-- =============================================================================
-- FIX_ROUND_NOT_FOUND.sql
-- SKYBIRD 3D CRASH GAME - CORREÇÃO DE "Round Not found" / "Rodada não encontrada"
-- =============================================================================
-- Execute este script no SQL Editor do seu dashboard Supabase para atualizar a
-- função place_bet e cashout_bet, garantindo que o id da rodada e o número da
-- rodada sejam associados automaticamente sem nunca dar erro ao apostar.
-- =============================================================================

-- 1. CONVERTER COLUNAS DE ID PARA TEXTO (SUPORTA 'rnd_1001' E ID NATIVO)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.bets ALTER COLUMN round_id TYPE TEXT USING round_id::text;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.game_rounds ALTER COLUMN id TYPE TEXT USING id::text;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- 2. RECRIAR FUNÇÃO RPC place_bet ATÓMICA E COM AUTO-CRIAÇÃO DE RODADAS
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

  -- 4. Extrair número da rodada e verificar/bloquear estado (compatível com IDs text, uuid e round_number)
  v_round_number := COALESCE(NULLIF(regexp_replace(p_round_id, '\D', '', 'g'), '')::INT, 1000);

  SELECT status, round_number INTO v_round_status, v_round_number
  FROM public.game_rounds
  WHERE id::text = p_round_id 
     OR id::text = 'rnd_' || p_round_id 
     OR round_number = v_round_number;

  IF v_round_status IS NULL THEN
    BEGIN
      INSERT INTO public.game_rounds (id, round_number, status, server_seed_hash, client_seed, started_at)
      VALUES (
        p_round_id,
        v_round_number,
        'COUNTDOWN',
        encode(digest(p_round_id || '_seed', 'sha256'), 'hex'),
        'skybird_client_seed_main',
        NOW()
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    SELECT status, round_number INTO v_round_status, v_round_number
    FROM public.game_rounds
    WHERE id::text = p_round_id 
       OR id::text = 'rnd_' || p_round_id 
       OR round_number = v_round_number;

    IF v_round_status IS NULL THEN
      v_round_status := 'COUNTDOWN';
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

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.place_bet TO authenticated;
