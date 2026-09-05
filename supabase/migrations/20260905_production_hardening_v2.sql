-- SKY-BIRD PRODUCTION HARDENING V2
-- Adapted to the live schema discovered on 2026-09-05.
-- IMPORTANT: review and run in Supabase SQL Editor only after backup.
-- This migration preserves users and wallets; it does not reset balances.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_status_check;
ALTER TABLE public.bets ADD CONSTRAINT bets_status_check
CHECK (status = ANY (ARRAY['active'::text,'cashed_out'::text,'crashed'::text,'lost'::text,'cancelled'::text]));

DROP FUNCTION IF EXISTS public.place_bet(text,numeric,integer,numeric,text,text);
DROP FUNCTION IF EXISTS public.place_bet(text,numeric,integer,numeric,text);
DROP FUNCTION IF EXISTS public.cashout_bet(text,numeric,text);
DROP FUNCTION IF EXISTS public.cashout_bet(text,numeric,text,text);
DROP FUNCTION IF EXISTS public.cashout_bet(text);

CREATE OR REPLACE FUNCTION public.place_bet(
  p_round_id text,
  p_amount numeric,
  p_panel_id integer DEFAULT 1,
  p_auto_cashout numeric DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_round public.game_rounds%ROWTYPE;
  v_balance numeric;
  v_bet_id uuid;
  v_tx_id uuid;
  v_before numeric;
  v_after numeric;
  v_response jsonb;
  v_existing jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount < 0.50 OR p_amount > 5000.00 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF p_panel_id NOT IN (1,2) THEN RAISE EXCEPTION 'INVALID_PANEL'; END IF;
  IF p_auto_cashout IS NOT NULL AND (p_auto_cashout < 1.01 OR p_auto_cashout > 1000) THEN RAISE EXCEPTION 'INVALID_AUTO_CASHOUT'; END IF;

  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT response_payload INTO v_existing
      FROM public.idempotency_keys
     WHERE user_id = v_user_id AND idempotency_key = trim(p_idempotency_key)
     FOR UPDATE;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT * INTO v_round FROM public.game_rounds WHERE id::text = trim(p_round_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'RUNNING' THEN RAISE EXCEPTION 'ROUND_NOT_RUNNING'; END IF;

  SELECT available_balance INTO v_balance FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;

  v_before := v_balance;
  v_after := v_balance - p_amount;

  UPDATE public.wallets SET available_balance = v_after, updated_at = now() WHERE user_id = v_user_id;

  v_bet_id := gen_random_uuid();
  INSERT INTO public.bets (
    id, round_id, user_id, amount, auto_cashout, auto_cashout_multiplier,
    status, panel_id, is_bot, created_at, updated_at
  ) VALUES (
    v_bet_id, v_round.id, v_user_id, p_amount, p_auto_cashout, p_auto_cashout,
    'active', p_panel_id, false, now(), now()
  );

  UPDATE public.game_rounds
     SET total_bets_amount = COALESCE(total_bets_amount,0) + p_amount
   WHERE id = v_round.id;

  v_tx_id := gen_random_uuid();
  INSERT INTO public.transactions (
    id, user_id, type, amount, currency, balance_before, balance_after,
    reference, status, created_at, updated_at
  ) VALUES (
    v_tx_id, v_user_id, 'bet_placed', p_amount, 'USD', v_before, v_after,
    'BET-' || v_round.round_number || '-P' || p_panel_id || '-' || v_bet_id,
    'completed', now(), now()
  );

  v_response := jsonb_build_object(
    'success', true, 'bet_id', v_bet_id, 'transaction_id', v_tx_id,
    'balance_before', v_before, 'balance_after', v_after,
    'round_id', v_round.id, 'round_number', v_round.round_number, 'panel_id', p_panel_id
  );

  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    INSERT INTO public.idempotency_keys (user_id,idempotency_key,request_type,response_payload)
    VALUES (v_user_id,trim(p_idempotency_key),'place_bet',v_response)
    ON CONFLICT (user_id,idempotency_key) DO UPDATE SET response_payload=EXCLUDED.response_payload;
  END IF;

  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.cashout_bet(p_bet_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bet public.bets%ROWTYPE;
  v_round public.game_rounds%ROWTYPE;
  v_multiplier numeric;
  v_payout numeric;
  v_before numeric;
  v_after numeric;
  v_tx_id uuid;
  v_elapsed numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_bet FROM public.bets WHERE id::text = trim(p_bet_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BET_NOT_FOUND'; END IF;
  IF v_bet.user_id <> v_user_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_bet.status <> 'active' THEN RAISE EXCEPTION 'BET_NOT_ACTIVE'; END IF;

  SELECT * INTO v_round FROM public.game_rounds WHERE id = v_bet.round_id FOR UPDATE;
  IF NOT FOUND OR v_round.status <> 'RUNNING' OR v_round.started_at IS NULL THEN RAISE EXCEPTION 'ROUND_ENDED'; END IF;

  v_elapsed := greatest(0, extract(epoch FROM (clock_timestamp() - v_round.started_at)));
  v_multiplier := greatest(1.00, floor(exp(0.25 * v_elapsed) * 100) / 100);

  IF v_round.crash_point IS NOT NULL AND v_multiplier >= v_round.crash_point THEN
    RAISE EXCEPTION 'ROUND_CRASHED';
  END IF;

  v_payout := round(v_bet.amount * v_multiplier, 2);

  SELECT available_balance INTO v_before FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  v_after := v_before + v_payout;

  UPDATE public.wallets SET available_balance=v_after, updated_at=now() WHERE user_id=v_user_id;
  UPDATE public.bets SET status='cashed_out', cashout_multiplier=v_multiplier, payout=v_payout, updated_at=now() WHERE id=v_bet.id;
  UPDATE public.game_rounds SET total_payout_amount=COALESCE(total_payout_amount,0)+v_payout WHERE id=v_round.id;

  v_tx_id := gen_random_uuid();
  INSERT INTO public.transactions (
    id,user_id,type,amount,currency,balance_before,balance_after,reference,status,created_at,updated_at
  ) VALUES (
    v_tx_id,v_user_id,'bet_cashed_out',v_payout,'USD',v_before,v_after,
    'CASHOUT-'||v_round.round_number||'-'||v_bet.id,'completed',now(),now()
  );

  RETURN jsonb_build_object(
    'success',true,'bet_id',v_bet.id,'multiplier',v_multiplier,
    'payout',v_payout,'balance_after',v_after,'transaction_id',v_tx_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_bet(text,numeric,integer,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashout_bet(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_bet(text,numeric,integer,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cashout_bet(text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_rounds FROM anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bets_active_user_round_panel
ON public.bets (round_id, user_id, panel_id)
WHERE status = 'active';

ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_available_balance_check;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_available_balance_check CHECK (available_balance >= 0);
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_locked_balance_check;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_locked_balance_check CHECK (locked_balance >= 0);
