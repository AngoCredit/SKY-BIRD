-- =============================================================================
-- SKYBIRD PRODUCTION HARDENING - 2026-09-05
-- Server-authoritative rounds, financial RPCs, immutable wallet access from clients.
-- This migration is intentionally additive/repair-oriented for an already deployed schema.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Never trust client-supplied identity in financial RPCs.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.place_bet(TEXT, NUMERIC, INT, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cashout_bet(TEXT, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.place_bet(
  p_round_id TEXT,
  p_amount NUMERIC,
  p_panel_id INT DEFAULT 1,
  p_auto_cashout NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_round_id TEXT;
  v_round_status TEXT;
  v_round_number INT;
  v_wallet_balance NUMERIC;
  v_bet_id UUID;
  v_tx_id UUID;
  v_response JSONB;
  v_existing JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_amount IS NULL OR p_amount < 0.50 OR p_amount > 5000.00 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  IF p_panel_id IS NULL OR p_panel_id < 1 OR p_panel_id > 2 THEN
    RAISE EXCEPTION 'INVALID_PANEL';
  END IF;

  IF p_auto_cashout IS NOT NULL AND (p_auto_cashout < 1.01 OR p_auto_cashout > 100000) THEN
    RAISE EXCEPTION 'INVALID_AUTO_CASHOUT';
  END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT response_payload INTO v_existing
      FROM public.idempotency_keys
     WHERE user_id = v_user_id AND idempotency_key = btrim(p_idempotency_key);
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  -- A round MUST already exist. The browser is never allowed to create one.
  SELECT id::text, status, round_number
    INTO v_round_id, v_round_status, v_round_number
    FROM public.game_rounds
   WHERE id::text = p_round_id
   FOR UPDATE;

  IF v_round_id IS NULL THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round_status NOT IN ('WAITING','COUNTDOWN') THEN
    RAISE EXCEPTION 'BETTING_CLOSED';
  END IF;

  SELECT available_balance INTO v_wallet_balance
    FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;

  IF v_wallet_balance IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_wallet_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.bets
     WHERE user_id = v_user_id AND round_id::text = v_round_id
       AND panel_id = p_panel_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_BET';
  END IF;

  UPDATE public.wallets
     SET available_balance = available_balance - p_amount,
         updated_at = now()
   WHERE user_id = v_user_id;

  v_bet_id := gen_random_uuid();
  INSERT INTO public.bets
    (id, round_id, user_id, amount, auto_cashout, auto_cashout_multiplier, status, panel_id, created_at)
  VALUES
    (v_bet_id, v_round_id, v_user_id, p_amount, p_auto_cashout, p_auto_cashout, 'active', p_panel_id, now());

  v_tx_id := gen_random_uuid();
  INSERT INTO public.transactions
    (id, user_id, type, amount, currency, balance_before, balance_after, reference, status, created_at)
  VALUES
    (v_tx_id, v_user_id, 'bet_placed', p_amount, 'USD', v_wallet_balance,
     v_wallet_balance - p_amount, 'BET-' || v_round_number || '-P' || p_panel_id, 'completed', now());

  v_response := jsonb_build_object(
    'success', true, 'bet_id', v_bet_id, 'transaction_id', v_tx_id,
    'balance_before', v_wallet_balance, 'balance_after', v_wallet_balance - p_amount,
    'round_number', v_round_number, 'panel_id', p_panel_id
  );

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    INSERT INTO public.idempotency_keys(user_id,idempotency_key,request_type,response_payload)
    VALUES(v_user_id,btrim(p_idempotency_key),'place_bet',v_response)
    ON CONFLICT (user_id,idempotency_key) DO NOTHING;
  END IF;

  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.cashout_bet(
  p_bet_id TEXT,
  p_multiplier NUMERIC,
  p_idempotency_key TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_bet_user UUID;
  v_amount NUMERIC;
  v_status TEXT;
  v_round_id TEXT;
  v_round_status TEXT;
  v_round_number INT;
  v_crash NUMERIC;
  v_started TIMESTAMPTZ;
  v_now_multiplier NUMERIC;
  v_payout NUMERIC;
  v_balance NUMERIC;
  v_tx UUID;
  v_response JSONB;
  v_existing JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_multiplier IS NULL OR p_multiplier < 1.01 THEN RAISE EXCEPTION 'INVALID_MULTIPLIER'; END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT response_payload INTO v_existing
      FROM public.idempotency_keys
     WHERE user_id=v_user_id AND idempotency_key=btrim(p_idempotency_key);
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT user_id, amount, status, round_id::text
    INTO v_bet_user, v_amount, v_status, v_round_id
    FROM public.bets WHERE id::text=p_bet_id FOR UPDATE;

  IF v_bet_user IS NULL THEN RAISE EXCEPTION 'BET_NOT_FOUND'; END IF;
  IF v_bet_user <> v_user_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'BET_NOT_ACTIVE'; END IF;

  SELECT status, crash_point, round_number, started_at
    INTO v_round_status, v_crash, v_round_number, v_started
    FROM public.game_rounds WHERE id::text=v_round_id FOR UPDATE;

  IF v_round_status <> 'RUNNING' THEN RAISE EXCEPTION 'ROUND_ENDED'; END IF;
  IF v_crash IS NULL OR v_started IS NULL THEN RAISE EXCEPTION 'ROUND_NOT_READY'; END IF;

  -- The server derives the current multiplier from server time. The browser only says "cash out now".
  -- Formula: M(t)=e^(0.25*t_seconds), capped by the committed crash point.
  v_now_multiplier := LEAST(v_crash, floor(exp(0.25 * extract(epoch from (clock_timestamp()-v_started))) * 100) / 100.0);

  IF p_multiplier > v_now_multiplier + 0.01 THEN
    RAISE EXCEPTION 'CASHOUT_TOO_LATE';
  END IF;

  v_payout := round(v_amount * v_now_multiplier, 2);

  SELECT available_balance INTO v_balance FROM public.wallets WHERE user_id=v_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

  UPDATE public.wallets
     SET available_balance=available_balance+v_payout, updated_at=now()
   WHERE user_id=v_user_id;

  UPDATE public.bets
     SET status='cashed_out', cashout_multiplier=v_now_multiplier, payout=v_payout, updated_at=now()
   WHERE id::text=p_bet_id AND status='active';

  IF NOT FOUND THEN RAISE EXCEPTION 'BET_NOT_ACTIVE'; END IF;

  v_tx := gen_random_uuid();
  INSERT INTO public.transactions
    (id,user_id,type,amount,currency,balance_before,balance_after,reference,status,created_at)
  VALUES
    (v_tx,v_user_id,'bet_cashed_out',v_payout,'USD',v_balance,v_balance+v_payout,
     'CASHOUT-'||v_round_number,'completed',now());

  v_response := jsonb_build_object(
    'success',true,'payout',v_payout,'multiplier',v_now_multiplier,
    'balance_after',v_balance+v_payout,'transaction_id',v_tx,'bet_id',p_bet_id
  );

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    INSERT INTO public.idempotency_keys(user_id,idempotency_key,request_type,response_payload)
    VALUES(v_user_id,btrim(p_idempotency_key),'cashout_bet',v_response)
    ON CONFLICT (user_id,idempotency_key) DO NOTHING;
  END IF;
  RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Cryptographically secure, server-authoritative round lifecycle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_next_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_prev RECORD;
  v_id TEXT := 'rnd_' || gen_random_uuid()::text;
  v_number INT;
  v_seed TEXT := encode(gen_random_bytes(32),'hex');
  v_client_seed TEXT := 'skybird-public-client-v1';
  v_nonce BIGINT;
  v_hash TEXT;
BEGIN
  SELECT * INTO v_prev FROM public.game_rounds ORDER BY round_number DESC LIMIT 1 FOR UPDATE;
  v_number := COALESCE(v_prev.round_number,0)+1;
  v_nonce := COALESCE(v_prev.nonce,0)+1;
  v_hash := encode(digest(v_seed,'sha256'),'hex');

  INSERT INTO public.game_rounds
    (id,round_number,status,server_seed,server_seed_hash,client_seed,nonce,started_at,crash_point)
  VALUES
    (v_id,v_number,'WAITING',v_seed,v_hash,v_client_seed,v_nonce,NULL,NULL);

  RETURN jsonb_build_object('round_id',v_id,'round_number',v_number,'status','WAITING',
    'server_seed_hash',v_hash,'client_seed',v_client_seed,'nonce',v_nonce);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_round(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r RECORD; h TEXT; u NUMERIC; cp NUMERIC;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id::text=p_round_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF r.status NOT IN ('WAITING','COUNTDOWN') THEN RAISE EXCEPTION 'INVALID_ROUND_STATE'; END IF;
  h := encode(digest(r.server_seed || ':' || r.client_seed || ':' || r.nonce::text,'sha256'),'hex');
  u := (('x'||substr(h,1,13))::bit(52)::bigint::numeric) / 4503599627370496.0;
  -- 7.5% house edge, deterministic and independent of betting volume.
  cp := greatest(1.00, floor(((0.925 / greatest(0.000001,1-u)))*100)/100.0);
  UPDATE public.game_rounds SET status='RUNNING', started_at=clock_timestamp(), crash_point=cp WHERE id::text=p_round_id;
  RETURN jsonb_build_object('round_id',r.id,'round_number',r.round_number,'status','RUNNING','server_seed_hash',r.server_seed_hash,'client_seed',r.client_seed,'nonce',r.nonce);
END;
$$;

CREATE OR REPLACE FUNCTION public.crash_round(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id::text=p_round_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF r.status <> 'RUNNING' THEN RAISE EXCEPTION 'INVALID_ROUND_STATE'; END IF;
  UPDATE public.game_rounds SET status='CRASHED' WHERE id::text=p_round_id;
  UPDATE public.bets SET status='lost', payout=0, updated_at=now()
   WHERE round_id::text=p_round_id AND status='active';
  RETURN jsonb_build_object('round_id',r.id,'status','CRASHED','crash_point',r.crash_point,'round_number',r.round_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.reveal_round_seed(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id::text=p_round_id FOR SHARE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF r.status NOT IN ('CRASHED','SETTLED') THEN RAISE EXCEPTION 'SEED_NOT_REVEALABLE'; END IF;
  IF encode(digest(r.server_seed,'sha256'),'hex') <> r.server_seed_hash THEN RAISE EXCEPTION 'SEED_COMMITMENT_MISMATCH'; END IF;
  RETURN jsonb_build_object('round_id',r.id,'round_number',r.round_number,'server_seed',r.server_seed,
    'server_seed_hash',r.server_seed_hash,'client_seed',r.client_seed,'nonce',r.nonce,
    'crash_point',r.crash_point,'status',r.status);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Client financial tables: authenticated users may read their own wallet and
-- own history, but cannot manufacture balances/transactions from the browser.
-- Admin actions must go through SECURITY DEFINER RPCs.
-- -----------------------------------------------------------------------------
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_wallet" ON public.wallets;
CREATE POLICY "users_select_own_wallet" ON public.wallets FOR SELECT TO authenticated USING (auth.uid()=user_id);

DROP POLICY IF EXISTS "users_select_own_transactions" ON public.transactions;
CREATE POLICY "users_select_own_transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid()=user_id);

DROP POLICY IF EXISTS "users_select_own_bets" ON public.bets;
CREATE POLICY "users_select_own_bets" ON public.bets FOR SELECT TO authenticated USING (auth.uid()=user_id);

DROP POLICY IF EXISTS "authenticated_read_rounds" ON public.game_rounds;
CREATE POLICY "authenticated_read_rounds" ON public.game_rounds FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_rounds FROM authenticated;

REVOKE ALL ON FUNCTION public.create_next_round() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_round(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crash_round(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reveal_round_seed(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_bet(TEXT,NUMERIC,INT,NUMERIC,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cashout_bet(TEXT,NUMERIC,TEXT,TEXT) FROM PUBLIC;

-- The round-engine functions are deliberately NOT granted to authenticated users.
-- They must run from a trusted server/Edge Function using the service role.
GRANT EXECUTE ON FUNCTION public.place_bet(TEXT,NUMERIC,INT,NUMERIC,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cashout_bet(TEXT,NUMERIC,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_round_seed(TEXT) TO authenticated;

-- Prevent anonymous execution of financial functions.
REVOKE EXECUTE ON FUNCTION public.place_bet(TEXT,NUMERIC,INT,NUMERIC,TEXT,TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cashout_bet(TEXT,NUMERIC,TEXT,TEXT) FROM anon;

COMMENT ON FUNCTION public.place_bet(TEXT,NUMERIC,INT,NUMERIC,TEXT,TEXT) IS 'Authoritative atomic bet placement. Identity comes only from auth.uid().';
COMMENT ON FUNCTION public.cashout_bet(TEXT,NUMERIC,TEXT,TEXT) IS 'Authoritative cashout. Server derives current multiplier from server time.';
COMMENT ON FUNCTION public.create_next_round() IS 'Trusted server-only round creation with cryptographic seed commitment.';
