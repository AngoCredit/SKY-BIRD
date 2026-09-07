-- SKY-BIRD — cashout hardening
-- Keep financial mutation order deterministic: bet -> round -> wallet.
-- Payout is calculated exclusively from server clock and committed crash point.

DROP FUNCTION IF EXISTS public.cashout_bet(text);

CREATE OR REPLACE FUNCTION public.cashout_bet(p_bet_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bet public.bets%rowtype;
  v_round public.game_rounds%rowtype;
  v_balance numeric;
  v_multiplier numeric;
  v_payout numeric;
  v_tx uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_bet
  FROM public.bets
  WHERE id::text=p_bet_id AND user_id=v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BET_NOT_FOUND'; END IF;
  IF v_bet.status <> 'active' THEN RAISE EXCEPTION 'BET_NOT_ACTIVE'; END IF;

  SELECT * INTO v_round
  FROM public.game_rounds
  WHERE id=v_bet.round_id
  FOR UPDATE;
  IF NOT FOUND OR v_round.status<>'RUNNING' OR v_round.started_at IS NULL OR v_round.crash_point IS NULL THEN
    RAISE EXCEPTION 'ROUND_ENDED';
  END IF;

  v_multiplier := LEAST(
    v_round.crash_point,
    floor(exp(0.25 * extract(epoch FROM (clock_timestamp()-v_round.started_at))) * 100) / 100.0
  );
  IF v_multiplier < 1.01 THEN RAISE EXCEPTION 'CASHOUT_TOO_EARLY'; END IF;

  v_payout := round(v_bet.amount * v_multiplier,2);

  SELECT available_balance INTO v_balance
  FROM public.wallets
  WHERE user_id=v_uid
  FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

  UPDATE public.wallets
  SET available_balance=v_balance+v_payout, updated_at=clock_timestamp()
  WHERE user_id=v_uid;

  UPDATE public.bets
  SET status='cashed_out',
      cashout_multiplier=v_multiplier,
      payout=v_payout,
      updated_at=clock_timestamp()
  WHERE id=v_bet.id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'BET_NOT_ACTIVE'; END IF;

  INSERT INTO public.transactions(
    user_id,type,amount,currency,balance_before,balance_after,reference,status,created_at
  ) VALUES (
    v_uid,'bet_cashed_out',v_payout,'USD',v_balance,v_balance+v_payout,
    'CASHOUT-'||v_round.round_number,'completed',clock_timestamp()
  ) RETURNING id INTO v_tx;

  RETURN jsonb_build_object(
    'success',true,
    'payout',v_payout,
    'multiplier',v_multiplier,
    'balance_after',v_balance+v_payout,
    'transaction_id',v_tx,
    'bet_id',v_bet.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cashout_bet(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cashout_bet(text) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.cashout_bet(text,numeric,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.cashout_bet(text,numeric,text) FROM PUBLIC,anon,authenticated';
  END IF;
  IF to_regprocedure('public.cashout_bet(text,numeric,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.cashout_bet(text,numeric,text,text) FROM PUBLIC,anon,authenticated';
  END IF;
END $$;
