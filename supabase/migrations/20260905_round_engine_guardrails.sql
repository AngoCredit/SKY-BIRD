-- SKYBIRD ROUND ENGINE GUARDRAILS
-- Prevent client-controlled lifecycle transitions and cap unsafe state changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.start_round(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  h TEXT;
  u NUMERIC;
  cp NUMERIC;
BEGIN
  SELECT * INTO r
  FROM public.game_rounds
  WHERE id::text = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF r.status NOT IN ('WAITING','COUNTDOWN') THEN RAISE EXCEPTION 'INVALID_ROUND_STATE'; END IF;
  IF r.server_seed IS NULL OR r.server_seed_hash IS NULL THEN RAISE EXCEPTION 'ROUND_SEED_INVALID'; END IF;

  h := encode(digest(r.server_seed || ':' || r.client_seed || ':' || r.nonce::text,'sha256'),'hex');
  IF h <> lower(r.server_seed_hash) THEN RAISE EXCEPTION 'SEED_COMMITMENT_MISMATCH'; END IF;

  u := (('x'||substr(h,1,13))::bit(52)::bigint::numeric) / 4503599627370496.0;
  cp := greatest(1.00, floor(((0.925 / greatest(0.000001,1-u)))*100)/100.0);

  UPDATE public.game_rounds
  SET status='RUNNING',
      started_at=clock_timestamp(),
      crash_point=cp,
      updated_at=clock_timestamp()
  WHERE id::text=p_round_id;

  RETURN jsonb_build_object(
    'round_id',r.id,
    'round_number',r.round_number,
    'status','RUNNING',
    'server_seed_hash',r.server_seed_hash,
    'client_seed',r.client_seed,
    'nonce',r.nonce
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crash_round(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id::text=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF r.status <> 'RUNNING' THEN RAISE EXCEPTION 'INVALID_ROUND_STATE'; END IF;

  UPDATE public.game_rounds
  SET status='CRASHED', ended_at=clock_timestamp(), updated_at=clock_timestamp()
  WHERE id::text=p_round_id;

  UPDATE public.bets
  SET status='lost', payout=0, updated_at=clock_timestamp()
  WHERE round_id::text=p_round_id AND status='active';

  UPDATE public.game_rounds
  SET total_payout_amount = COALESCE((
    SELECT SUM(COALESCE(payout,0)) FROM public.bets WHERE round_id::text=p_round_id
  ),0)
  WHERE id::text=p_round_id;

  RETURN jsonb_build_object(
    'round_id',r.id,
    'status','CRASHED',
    'crash_point',r.crash_point,
    'round_number',r.round_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_round(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crash_round(TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;
