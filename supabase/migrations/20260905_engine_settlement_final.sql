-- =============================================================================
-- SKY-BIRD — FINAL ENGINE SETTLEMENT HARDENING
--
-- Keeps the database authoritative even when the worker tick is delayed.
-- Auto-cashouts whose target multiplier is below the committed crash point are
-- settled at their configured target during finalization; they are never
-- retroactively paid after the crash point.
--
-- The engine worker must call tick_game_engine(). Clients may call cashout_bet()
-- only. Engine settlement/crash RPCs are intentionally not client-executable.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.settle_auto_cashouts(p_round_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_round public.game_rounds%ROWTYPE;
  v_bet public.bets%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_elapsed numeric;
  v_crash_time numeric;
  v_current_multiplier numeric;
  v_payout numeric;
  v_before numeric;
  v_after numeric;
  v_settled integer := 0;
BEGIN
  SELECT *
    INTO v_round
    FROM public.game_rounds
   WHERE id::text = p_round_id
   FOR UPDATE;

  IF NOT FOUND OR v_round.status NOT IN ('RUNNING','CRASHED','SETTLED') THEN
    RETURN jsonb_build_object('settled', 0, 'round_id', p_round_id);
  END IF;

  IF v_round.started_at IS NULL OR v_round.crash_point IS NULL THEN
    RETURN jsonb_build_object('settled', 0, 'round_id', p_round_id);
  END IF;

  v_elapsed := greatest(
    0,
    extract(epoch FROM (clock_timestamp() - v_round.started_at))::numeric
  );
  v_crash_time := ln(greatest(v_round.crash_point, 1.00)) / 0.25;
  v_current_multiplier := greatest(
    1.00,
    floor(exp(0.25 * least(v_elapsed, v_crash_time)) * 100) / 100
  );

  FOR v_bet IN
    SELECT b.*
      FROM public.bets b
     WHERE b.round_id::text = p_round_id
       AND b.status = 'active'
       AND b.is_bot = false
       AND b.auto_cashout IS NOT NULL
       AND b.auto_cashout >= 1.01
       AND b.auto_cashout < v_round.crash_point
       AND (
         v_round.status IN ('CRASHED','SETTLED')
         OR b.auto_cashout <= v_current_multiplier
       )
     ORDER BY b.created_at, b.id
     FOR UPDATE
  LOOP
    -- The configured target is deterministic and valid because it is strictly
    -- below the committed crash point. If the worker was late, this still pays
    -- the target that would have occurred before the crash.
    v_payout := round(v_bet.amount * v_bet.auto_cashout, 2);

    SELECT *
      INTO v_wallet
      FROM public.wallets
     WHERE user_id = v_bet.user_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND';
    END IF;

    v_before := v_wallet.available_balance;
    v_after := v_before + v_payout;

    UPDATE public.wallets
       SET available_balance = v_after,
           updated_at = clock_timestamp()
     WHERE user_id = v_bet.user_id;

    UPDATE public.bets
       SET status = 'cashed_out',
           cashout_multiplier = v_bet.auto_cashout,
           payout = v_payout,
           updated_at = clock_timestamp()
     WHERE id = v_bet.id
       AND status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'BET_SETTLEMENT_RACE';
    END IF;

    UPDATE public.game_rounds
       SET total_payout_amount = COALESCE(total_payout_amount, 0) + v_payout
     WHERE id::text = p_round_id;

    INSERT INTO public.transactions (
      user_id, type, amount, currency, status,
      balance_before, balance_after, description, created_at
    ) VALUES (
      v_bet.user_id,
      'bet_cashed_out',
      v_payout,
      COALESCE(v_wallet.currency, 'USD'),
      'completed',
      v_before,
      v_after,
      format('Auto cashout for bet %s at %.2fx', v_bet.id, v_bet.auto_cashout),
      clock_timestamp()
    );

    v_settled := v_settled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'settled', v_settled,
    'round_id', p_round_id,
    'current_multiplier', v_current_multiplier,
    'crash_point', v_round.crash_point
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crash_round(p_round_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_round public.game_rounds%ROWTYPE;
  v_elapsed numeric;
  v_crash_time numeric;
  v_auto jsonb;
  v_lost integer := 0;
BEGIN
  SELECT *
    INTO v_round
    FROM public.game_rounds
   WHERE id::text = p_round_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND';
  END IF;

  IF v_round.status IN ('CRASHED','SETTLED') THEN
    RETURN jsonb_build_object(
      'round_id', p_round_id,
      'status', v_round.status,
      'crash_point', v_round.crash_point
    );
  END IF;

  IF v_round.status <> 'RUNNING'
     OR v_round.started_at IS NULL
     OR v_round.crash_point IS NULL THEN
    RAISE EXCEPTION 'INVALID_ROUND_STATE';
  END IF;

  v_elapsed := greatest(
    0,
    extract(epoch FROM (clock_timestamp() - v_round.started_at))::numeric
  );
  v_crash_time := ln(greatest(v_round.crash_point, 1.00)) / 0.25;

  IF v_elapsed < v_crash_time THEN
    RAISE EXCEPTION 'ROUND_NOT_READY_TO_CRASH';
  END IF;

  -- Finalization settles all deterministic auto-cashouts below the crash point,
  -- even if the worker tick arrived after the mathematical crash instant.
  v_auto := public.settle_auto_cashouts(p_round_id);

  UPDATE public.bets
     SET status = 'lost',
         updated_at = clock_timestamp()
   WHERE round_id::text = p_round_id
     AND status = 'active'
     AND is_bot = false;

  GET DIAGNOSTICS v_lost = ROW_COUNT;

  UPDATE public.game_rounds
     SET status = 'CRASHED',
         ended_at = clock_timestamp()
   WHERE id::text = p_round_id;

  RETURN jsonb_build_object(
    'round_id', p_round_id,
    'status', 'CRASHED',
    'crash_point', v_round.crash_point,
    'auto_cashouts', COALESCE(v_auto->'settled', '0'::jsonb),
    'lost_bets', v_lost
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_auto_cashouts(text)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.crash_round(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.settle_auto_cashouts(text)
TO postgres;

GRANT EXECUTE ON FUNCTION public.crash_round(text)
TO postgres;
