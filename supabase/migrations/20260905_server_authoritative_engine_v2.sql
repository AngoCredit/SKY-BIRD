-- SKY-BIRD SERVER-AUTHORITATIVE CRASH ENGINE V2
-- Compatible with the live schema audited on 2026-09-05.
-- Requires pgcrypto. pg_cron is optional; without it, an external trusted
-- scheduler must invoke tick_game_engine().

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Provably-fair crash calculation.
-- H = SHA256(server_seed:client_seed:nonce)
-- U = first 52 bits(H) / 2^52
-- crash = max(1.00, floor((0.925/(1-U))*100)/100)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_crash_point(
  p_server_seed text,
  p_client_seed text,
  p_nonce bigint
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  h bytea;
  first_52 numeric;
  u numeric;
  result numeric;
BEGIN
  h := digest(p_server_seed || ':' || p_client_seed || ':' || p_nonce::text, 'sha256');

  first_52 := (
      get_byte(h,0) * 281474976710656
    + get_byte(h,1) * 1099511627776
    + get_byte(h,2) * 4294967296
    + get_byte(h,3) * 16777216
    + get_byte(h,4) * 65536
    + get_byte(h,5) * 256
    + floor(get_byte(h,6) / 16)
  );

  u := first_52 / 4503599627370496.0;
  result := greatest(1.00, floor((0.925 / (1.0 - u)) * 100) / 100);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_crash_point(text,text,bigint) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Create a new waiting round. Server seed never comes from the client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_next_round()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last public.game_rounds%ROWTYPE;
  v_id text;
  v_number bigint;
  v_seed text;
  v_hash text;
  v_client_seed text := 'SKY-BIRD-PUBLIC-SEED';
  v_nonce bigint;
BEGIN
  SELECT * INTO v_last
    FROM public.game_rounds
   ORDER BY round_number DESC
   LIMIT 1
   FOR UPDATE;

  IF v_last.id IS NOT NULL AND v_last.status IN ('WAITING','COUNTDOWN','RUNNING') THEN
    RETURN jsonb_build_object(
      'success',true,'round_id',v_last.id,'round_number',v_last.round_number,
      'server_seed_hash',v_last.server_seed_hash,'client_seed',v_last.client_seed,
      'nonce',v_last.nonce,'status',v_last.status
    );
  END IF;

  v_number := COALESCE(v_last.round_number,0) + 1;
  v_id := 'rnd_' || v_number::text;
  v_seed := encode(gen_random_bytes(32),'hex');
  v_hash := encode(digest(v_seed,'sha256'),'hex');
  v_nonce := v_number;

  INSERT INTO public.game_rounds (
    id, round_number, status, started_at, ended_at, crash_point,
    server_seed, server_seed_hash, client_seed, nonce,
    total_bets_amount, total_payout_amount, created_at
  ) VALUES (
    v_id, v_number, 'WAITING', NULL, NULL, NULL,
    v_seed, v_hash, v_client_seed, v_nonce,
    0, 0, now()
  );

  RETURN jsonb_build_object(
    'success',true,'round_id',v_id,'round_number',v_number,
    'server_seed_hash',v_hash,'client_seed',v_client_seed,
    'nonce',v_nonce,'status','WAITING'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Start round: verify commitment before exposing the running state.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_round(p_round_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  v_expected_hash text;
  v_crash numeric;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id = trim(p_round_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF r.status <> 'WAITING' THEN RAISE EXCEPTION 'ROUND_NOT_WAITING'; END IF;
  IF r.server_seed IS NULL OR r.server_seed_hash IS NULL THEN RAISE EXCEPTION 'ROUND_SEED_MISSING'; END IF;

  v_expected_hash := encode(digest(r.server_seed,'sha256'),'hex');
  IF v_expected_hash <> r.server_seed_hash THEN RAISE EXCEPTION 'SEED_COMMITMENT_MISMATCH'; END IF;

  v_crash := public.calculate_crash_point(r.server_seed,r.client_seed,r.nonce);

  UPDATE public.game_rounds
     SET status='RUNNING',
         started_at=clock_timestamp(),
         crash_point=v_crash
   WHERE id=r.id;

  RETURN jsonb_build_object(
    'success',true,'round_id',r.id,'round_number',r.round_number,
    'status','RUNNING','started_at',clock_timestamp()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Current authoritative multiplier. It is derived from database time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_round_multiplier(p_round_id text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  elapsed numeric;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id=trim(p_round_id);
  IF NOT FOUND OR r.status <> 'RUNNING' OR r.started_at IS NULL THEN
    RETURN NULL;
  END IF;
  elapsed := greatest(0,extract(epoch FROM (clock_timestamp()-r.started_at)));
  RETURN greatest(1.00,floor(exp(0.25*elapsed)*100)/100);
END;
$$;

REVOKE ALL ON FUNCTION public.current_round_multiplier(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Server-side automatic cashouts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_auto_cashouts(p_round_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  b public.bets%ROWTYPE;
  v_target numeric;
  v_multiplier numeric;
  v_payout numeric;
  v_before numeric;
  v_after numeric;
  v_tx uuid;
  v_count integer := 0;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id=trim(p_round_id) FOR UPDATE;
  IF NOT FOUND OR r.status <> 'RUNNING' OR r.started_at IS NULL THEN
    RETURN jsonb_build_object('settled',0);
  END IF;

  v_multiplier := public.current_round_multiplier(r.id);

  FOR b IN
    SELECT * FROM public.bets
     WHERE round_id=r.id AND status='active'
       AND COALESCE(is_bot,false)=false
       AND COALESCE(auto_cashout_multiplier,auto_cashout) IS NOT NULL
     FOR UPDATE
  LOOP
    v_target := COALESCE(b.auto_cashout_multiplier,b.auto_cashout);
    IF v_target IS NULL OR v_target < 1.01 THEN CONTINUE; END IF;
    IF r.crash_point IS NOT NULL AND v_target >= r.crash_point THEN CONTINUE; END IF;
    IF v_multiplier < v_target THEN CONTINUE; END IF;

    SELECT available_balance INTO v_before FROM public.wallets WHERE user_id=b.user_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_payout := round(b.amount * v_target,2);
    v_after := v_before + v_payout;

    UPDATE public.wallets SET available_balance=v_after, updated_at=now() WHERE user_id=b.user_id;
    UPDATE public.bets SET status='cashed_out',cashout_multiplier=v_target,payout=v_payout,updated_at=now() WHERE id=b.id;
    UPDATE public.game_rounds SET total_payout_amount=COALESCE(total_payout_amount,0)+v_payout WHERE id=r.id;

    v_tx := gen_random_uuid();
    INSERT INTO public.transactions (
      id,user_id,type,amount,currency,balance_before,balance_after,
      reference,status,created_at,updated_at
    ) VALUES (
      v_tx,b.user_id,'bet_cashed_out',v_payout,'USD',v_before,v_after,
      'AUTO-CASHOUT-'||r.round_number||'-'||b.id,'completed',now(),now()
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('settled',v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_auto_cashouts(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Crash and settle active bets. No payout is generated for losers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crash_round(p_round_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  v_lost integer;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id=trim(p_round_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF r.status <> 'RUNNING' THEN RAISE EXCEPTION 'ROUND_NOT_RUNNING'; END IF;

  UPDATE public.bets
     SET status='crashed', updated_at=now()
   WHERE round_id=r.id AND status='active';

  GET DIAGNOSTICS v_lost = ROW_COUNT;

  UPDATE public.game_rounds
     SET status='CRASHED',ended_at=clock_timestamp()
   WHERE id=r.id;

  RETURN jsonb_build_object('success',true,'round_id',r.id,'round_number',r.round_number,'crash_point',r.crash_point,'lost_bets',v_lost);
END;
$$;

REVOKE ALL ON FUNCTION public.crash_round(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- One database tick. Schedule externally or through pg_cron.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tick_game_engine()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  v_elapsed numeric;
  v_crash_elapsed numeric;
  v_auto jsonb;
BEGIN
  SELECT * INTO r FROM public.game_rounds ORDER BY round_number DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.create_next_round();
  END IF;

  IF r.status IN ('CRASHED','SETTLED') THEN
    IF r.ended_at IS NOT NULL AND clock_timestamp()-r.ended_at >= interval '5 seconds' THEN
      RETURN public.create_next_round();
    END IF;
    RETURN jsonb_build_object('action','waiting_after_crash','round',r.round_number);
  END IF;

  IF r.status='WAITING' THEN
    IF clock_timestamp()-r.created_at >= interval '5 seconds' THEN
      RETURN public.start_round(r.id);
    END IF;
    RETURN jsonb_build_object('action','waiting','round',r.round_number);
  END IF;

  IF r.status='RUNNING' THEN
    IF r.started_at IS NULL OR r.crash_point IS NULL THEN
      RETURN jsonb_build_object('action','invalid_running_round','round',r.round_number);
    END IF;

    v_auto := public.settle_auto_cashouts(r.id);
    v_elapsed := greatest(0,extract(epoch FROM (clock_timestamp()-r.started_at)));
    v_crash_elapsed := ln(greatest(r.crash_point,1.0))/0.25;

    IF v_elapsed >= v_crash_elapsed THEN
      PERFORM public.crash_round(r.id);
      RETURN jsonb_build_object('action','crashed','round',r.round_number,'crash_point',r.crash_point,'auto_cashouts',v_auto->'settled');
    END IF;

    RETURN jsonb_build_object('action','running','round',r.round_number,'auto_cashouts',v_auto->'settled');
  END IF;

  RETURN jsonb_build_object('action','noop','round',r.round_number,'status',r.status);
END;
$$;

REVOKE ALL ON FUNCTION public.tick_game_engine() FROM PUBLIC, anon, authenticated;

-- Safe public RPC: never returns server_seed while the round is live.
CREATE OR REPLACE FUNCTION public.get_current_round()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.game_rounds ORDER BY round_number DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('round',NULL); END IF;

  RETURN jsonb_build_object(
    'id',r.id,
    'round_number',r.round_number,
    'status',r.status,
    'started_at',r.started_at,
    'ended_at',r.ended_at,
    'server_seed_hash',r.server_seed_hash,
    'client_seed',r.client_seed,
    'nonce',r.nonce,
    'total_bets_amount',COALESCE(r.total_bets_amount,0),
    'total_payout_amount',COALESCE(r.total_payout_amount,0),
    'crash_point',CASE WHEN r.status IN ('CRASHED','SETTLED') THEN r.crash_point ELSE NULL END,
    'server_seed',CASE WHEN r.status IN ('CRASHED','SETTLED') THEN r.server_seed ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_round() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reveal_round_seed(p_round_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id=trim(p_round_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF r.status NOT IN ('CRASHED','SETTLED') THEN RAISE EXCEPTION 'ROUND_NOT_REVEALED'; END IF;
  RETURN jsonb_build_object(
    'round_id',r.id,'round_number',r.round_number,'server_seed',r.server_seed,
    'server_seed_hash',r.server_seed_hash,'client_seed',r.client_seed,
    'nonce',r.nonce,'crash_point',r.crash_point,'status',r.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_round_seed(text) TO anon, authenticated;

-- Sensitive seed must never be directly selectable by browser roles.
REVOKE SELECT (server_seed, crash_point) ON public.game_rounds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_rounds FROM anon, authenticated;

-- pg_cron is optional. If available, schedule the authoritative tick.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.unschedule('skybird-game-engine-v2-1s');
    PERFORM cron.schedule('skybird-game-engine-v2-1s','1 second','SELECT public.tick_game_engine();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;
