BEGIN;

CREATE OR REPLACE FUNCTION public.get_current_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE r public.game_rounds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.game_rounds ORDER BY round_number DESC LIMIT 1;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', r.id,
    'round_number', r.round_number,
    'status', r.status,
    'started_at', r.started_at,
    'ended_at', r.ended_at,
    'server_seed_hash', r.server_seed_hash,
    'client_seed', r.client_seed,
    'nonce', r.nonce,
    'total_bets_amount', COALESCE(r.total_bets_amount,0),
    'total_payout_amount', COALESCE(r.total_payout_amount,0),
    'crash_point', CASE WHEN r.status IN ('CRASHED','SETTLED') THEN r.crash_point ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_round(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE r public.game_rounds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.game_rounds WHERE id::text=p_round_id;
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
    'total_bets_amount', COALESCE(r.total_bets_amount,0),
    'total_payout_amount', COALESCE(r.total_payout_amount,0),
    'crash_point', CASE WHEN r.status IN ('CRASHED','SETTLED') THEN r.crash_point ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_round() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_round(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_round() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_round(TEXT) TO authenticated;

COMMIT;
