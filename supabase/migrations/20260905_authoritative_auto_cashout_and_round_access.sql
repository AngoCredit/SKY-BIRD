-- SKYBIRD AUTHORITATIVE AUTO-CASHOUT + SAFE ROUND ACCESS
-- All payout decisions remain server-side. The browser never supplies a multiplier.

BEGIN;

CREATE OR REPLACE FUNCTION public.settle_auto_cashouts(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  b public.bets%ROWTYPE;
  wallet_row public.wallets%ROWTYPE;
  elapsed_seconds NUMERIC;
  current_multiplier NUMERIC;
  payout_amount NUMERIC;
  settled_count INTEGER := 0;
BEGIN
  SELECT * INTO r
  FROM public.game_rounds
  WHERE id::text = p_round_id
  FOR UPDATE;

  IF NOT FOUND OR r.status <> 'RUNNING' OR r.started_at IS NULL THEN
    RETURN jsonb_build_object('round_id', p_round_id, 'settled', 0);
  END IF;

  elapsed_seconds := EXTRACT(EPOCH FROM (clock_timestamp() - r.started_at));
  current_multiplier := LEAST(r.crash_point, EXP(0.25 * GREATEST(0, elapsed_seconds)));

  FOR b IN
    SELECT *
    FROM public.bets
    WHERE round_id::text = p_round_id
      AND status = 'active'
      AND auto_cashout IS NOT NULL
      AND auto_cashout >= 1.01
      AND auto_cashout <= r.crash_point
      AND auto_cashout <= current_multiplier
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    payout_amount := round(b.amount * b.auto_cashout, 2);

    SELECT * INTO wallet_row
    FROM public.wallets
    WHERE id = b.wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND';
    END IF;

    UPDATE public.wallets
    SET balance = balance + payout_amount,
        updated_at = clock_timestamp()
    WHERE id = wallet_row.id;

    UPDATE public.bets
    SET status = 'cashed_out',
        cashout_multiplier = b.auto_cashout,
        payout = payout_amount,
        cashed_out_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = b.id AND status = 'active';

    IF FOUND THEN
      INSERT INTO public.transactions (
        user_id, wallet_id, type, amount, currency,
        balance_before, balance_after, status, reference, method, details
      )
      VALUES (
        b.user_id,
        wallet_row.id,
        'bet_cashed_out',
        payout_amount,
        COALESCE(wallet_row.currency, 'USD'),
        wallet_row.balance,
        wallet_row.balance + payout_amount,
        'completed',
        'BET:' || b.id::text,
        'game',
        jsonb_build_object('round_id', r.id, 'bet_id', b.id, 'multiplier', b.auto_cashout, 'source', 'server_auto_cashout')
      );
      settled_count := settled_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'round_id', r.id,
    'settled', settled_count,
    'multiplier', current_multiplier
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_auto_cashouts(TEXT) FROM PUBLIC, anon, authenticated;

-- Keep sensitive server_seed inaccessible to browser roles while allowing
-- realtime/public round state to be observed through safe columns only.
REVOKE SELECT ON public.game_rounds FROM authenticated;
GRANT SELECT (
  id,
  round_number,
  status,
  started_at,
  ended_at,
  server_seed_hash,
  client_seed,
  nonce,
  total_bets_amount,
  total_payout_amount,
  crash_point,
  created_at,
  updated_at
) ON public.game_rounds TO authenticated;

-- Public read is not required for the authoritative game client.
REVOKE SELECT ON public.game_rounds FROM anon;

-- Safe initial snapshot for the game client. No server seed is ever returned.
CREATE OR REPLACE FUNCTION public.get_current_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE r public.game_rounds%ROWTYPE;
BEGIN
  SELECT * INTO r
  FROM public.game_rounds
  WHERE status IN ('WAITING','COUNTDOWN','RUNNING')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', r.id,
    'round_number', r.round_number,
    'status', r.status,
    'started_at', r.started_at,
    'ended_at', r.ended_at,
    'server_seed_hash', r.server_seed_hash,
    'client_seed', r.client_seed,
    'nonce', r.nonce,
    'total_bets_amount', r.total_bets_amount,
    'total_payout_amount', r.total_payout_amount,
    'crash_point', CASE WHEN r.status IN ('CRASHED','SETTLED') THEN r.crash_point ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_round() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_round() FROM anon;

CREATE OR REPLACE FUNCTION public.get_round(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE r public.game_rounds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id::text = p_round_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', r.id,
    'round_number', r.round_number,
    'status', r.status,
    'started_at', r.started_at,
    'ended_at', r.ended_at,
    'server_seed_hash', r.server_seed_hash,
    'client_seed', r.client_seed,
    'nonce', r.nonce,
    'total_bets_amount', r.total_bets_amount,
    'total_payout_amount', r.total_payout_amount,
    'crash_point', CASE WHEN r.status IN ('CRASHED','SETTLED') THEN r.crash_point ELSE NULL END,
    'server_seed', CASE WHEN r.status IN ('CRASHED','SETTLED') THEN r.server_seed ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_round(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_round(TEXT) FROM anon;

COMMIT;
