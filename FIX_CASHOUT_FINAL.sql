-- =============================================================================
-- FIX_CASHOUT_FINAL.sql
-- SKYBIRD — Correcção definitiva do cashout_bet (exige status RUNNING estrito)
-- Execute este script completo no SQL Editor do Supabase
-- =============================================================================

-- STEP 1: Garantir que a restrição CHECK da tabela transactions aceita todos os tipos de transação
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('deposit', 'withdrawal', 'bet', 'cashout', 'refund', 'referral_bonus', 'bet_placed', 'bet_cashed_out'));

-- STEP 2: Drop versões anteriores
DROP FUNCTION IF EXISTS public.cashout_bet(text, numeric);
DROP FUNCTION IF EXISTS public.cashout_bet(text, numeric, text);
DROP FUNCTION IF EXISTS public.cashout_bet(text, numeric, text, text);

-- STEP 3: Recriar cashout_bet exigindo rodada no estado RUNNING
CREATE OR REPLACE FUNCTION public.cashout_bet(
  p_bet_id     TEXT,
  p_multiplier NUMERIC,
  p_user_id    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id               UUID;
  v_bet_user_id           UUID;
  v_bet_amount            NUMERIC;
  v_bet_status            TEXT;
  v_round_id_raw          TEXT;
  v_round_status          TEXT;
  v_round_number          INT;
  v_crash_point           NUMERIC;
  v_authorized_multiplier NUMERIC;
  v_payout                NUMERIC;
  v_wallet_balance        NUMERIC;
  v_tx_id                 UUID;
  v_response              JSONB;
BEGIN
  -- ── 1. Autenticação ─────────────────────────────────────────────────────────
  v_user_id := auth.uid();

  IF v_user_id IS NULL AND p_user_id IS NOT NULL AND TRIM(p_user_id) <> '' AND p_user_id <> 'usr_guest' THEN
    BEGIN
      v_user_id := p_user_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Utilizador não autenticado.';
  END IF;

  -- ── 2. Bloquear e validar aposta (FOR UPDATE previne duplo cashout) ─────────
  SELECT user_id, amount, status, round_id::text
  INTO   v_bet_user_id, v_bet_amount, v_bet_status, v_round_id_raw
  FROM   public.bets
  WHERE  id::text = p_bet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BET_NOT_FOUND: Aposta % não encontrada na base de dados.', p_bet_id;
  END IF;

  IF v_bet_user_id <> v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Esta aposta não pertence ao utilizador autenticado.';
  END IF;

  IF v_bet_status <> 'active' THEN
    RAISE EXCEPTION 'BET_NOT_ACTIVE: Aposta já foi encerrada (status: %).', v_bet_status;
  END IF;

  -- ── 3. Lookup da rodada no servidor ─────────────────────────────────────────
  BEGIN
    v_round_number := NULLIF(regexp_replace(v_round_id_raw, '^.*?(\d+)$', '\1'), '')::INT;
  EXCEPTION WHEN OTHERS THEN
    v_round_number := NULL;
  END;

  SELECT status, crash_point, round_number
  INTO   v_round_status, v_crash_point, v_round_number
  FROM   public.game_rounds
  WHERE  id::text        = v_round_id_raw
      OR id::text        = 'rnd_' || v_round_id_raw
      OR (v_round_number IS NOT NULL AND round_number = v_round_number)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- REGRA ESTRITA: O voo TEM de estar em andamento (status RUNNING)
  -- Rejeita cashout se o voo ainda não começou (COUNTDOWN/WAITING) ou se já caiu (CRASHED/SETTLED)
  IF v_round_status IS NULL OR v_round_status <> 'RUNNING' THEN
    IF v_round_status IN ('COUNTDOWN', 'WAITING') THEN
      RAISE EXCEPTION 'ROUND_NOT_STARTED: O voo ainda não começou. Aguarde a decolagem.';
    ELSE
      RAISE EXCEPTION 'ROUND_ENDED: O voo da rodada #% já foi encerrado (status: %).', COALESCE(v_round_number, 0), COALESCE(v_round_status, 'UNKNOWN');
    END IF;
  END IF;

  -- ── 4. Calcular multiplicador autorizado ────────────────────────────────────
  IF v_crash_point IS NOT NULL AND v_crash_point > 1.00 THEN
    v_authorized_multiplier := LEAST(p_multiplier, v_crash_point);
  ELSE
    v_authorized_multiplier := p_multiplier;
  END IF;

  v_authorized_multiplier := GREATEST(v_authorized_multiplier, 1.01);

  -- ── 5. Calcular payout ──────────────────────────────────────────────────────
  v_payout := ROUND(v_bet_amount * v_authorized_multiplier, 2);

  -- ── 6. Bloquear wallet e creditar payout atómicamente ──────────────────────
  SELECT available_balance
  INTO   v_wallet_balance
  FROM   public.wallets
  WHERE  user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, available_balance, locked_balance, currency)
    VALUES (v_user_id, 0, 0, 'USD')
    ON CONFLICT (user_id) DO NOTHING;
    v_wallet_balance := 0;
  END IF;

  UPDATE public.wallets
  SET    available_balance = available_balance + v_payout,
         updated_at        = NOW()
  WHERE  user_id = v_user_id;

  -- ── 7. Actualizar estado da aposta ──────────────────────────────────────────
  UPDATE public.bets
  SET    status             = 'cashed_out',
         cashout_multiplier = v_authorized_multiplier,
         payout             = v_payout
  WHERE  id::text = p_bet_id;

  -- ── 8. Ledger financeiro ────────────────────────────────────────────────────
  v_tx_id := gen_random_uuid();

  INSERT INTO public.transactions (
    id, user_id, type, amount, currency,
    balance_before, balance_after, reference, status, created_at
  ) VALUES (
    v_tx_id,
    v_user_id,
    'cashout',
    v_payout,
    'USD',
    v_wallet_balance,
    (v_wallet_balance + v_payout),
    'CASHOUT-RND' || v_round_number || '-' || v_authorized_multiplier || 'X',
    'completed',
    NOW()
  );

  -- ── 9. Resposta server-side ─────────────────────────────────────────────────
  v_response := jsonb_build_object(
    'success',        TRUE,
    'payout',         v_payout,
    'multiplier',     v_authorized_multiplier,
    'balance_after',  (v_wallet_balance + v_payout),
    'transaction_id', v_tx_id,
    'bet_id',         p_bet_id
  );

  RETURN v_response;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- STEP 4: Permissões
GRANT EXECUTE ON FUNCTION public.cashout_bet(TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cashout_bet(TEXT, NUMERIC, TEXT) TO anon;

SELECT 'FIX_CASHOUT_FINAL.sql atualizado com verificação estrita de RUNNING.' AS status;
