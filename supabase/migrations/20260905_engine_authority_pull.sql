-- =============================================================================
-- SKY-BIRD — PULL-DRIVEN SERVER AUTHORITY
--
-- Vercel is the application runtime. Supabase remains the authoritative game
-- clock and financial authority. Every authenticated round poll may advance
-- only a server-due lifecycle transition; the browser never supplies a
-- multiplier, crash point, seed, payout or timestamp.
--
-- This removes the requirement for a persistent 250ms worker while preserving
-- deterministic server-time settlement. The existing pg_cron job can remain
-- as a fallback/watchdog; it is no longer the only mechanism that advances a
-- live round.
-- =============================================================================

BEGIN;

-- Correct the previously generated start_round implementation so commitment
-- verification matches the stored server_seed_hash = SHA256(server_seed).
CREATE OR REPLACE FUNCTION public.start_round(p_round_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  commitment text;
  cp numeric;
BEGIN
  SELECT * INTO r
  FROM public.game_rounds
  WHERE id::text = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND';
  END IF;

  IF r.status NOT IN ('WAITING','COUNTDOWN') THEN
    RAISE EXCEPTION 'INVALID_ROUND_STATE';
  END IF;

  IF r.server_seed IS NULL
     OR r.server_seed_hash IS NULL
     OR r.client_seed IS NULL
     OR r.nonce IS NULL THEN
    RAISE EXCEPTION 'ROUND_SEED_INVALID';
  END IF;

  commitment := encode(
    extensions.digest(r.server_seed, 'sha256'::text),
    'hex'
  );

  IF lower(commitment) <> lower(r.server_seed_hash) THEN
    RAISE EXCEPTION 'SEED_COMMITMENT_MISMATCH';
  END IF;

  cp := public.calculate_crash_point(
    r.server_seed,
    r.client_seed,
    r.nonce
  );

  IF cp IS NULL OR cp < 1.00 THEN
    RAISE EXCEPTION 'INVALID_CRASH_POINT';
  END IF;

  UPDATE public.game_rounds
  SET status = 'RUNNING',
      started_at = clock_timestamp(),
      crash_point = cp
  WHERE id::text = p_round_id;

  RETURN jsonb_build_object(
    'round_id', r.id,
    'round_number', r.round_number,
    'status', 'RUNNING',
    'server_seed_hash', r.server_seed_hash,
    'client_seed', r.client_seed,
    'nonce', r.nonce,
    'crash_point', cp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_round(text)
FROM PUBLIC, anon, authenticated;

-- The read RPC is intentionally VOLATILE because a read can advance only
-- transitions that are already due according to PostgreSQL server time.
CREATE OR REPLACE FUNCTION public.get_current_round()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  elapsed numeric;
  crash_time numeric;
  acquired boolean;
BEGIN
  -- Serialize all lifecycle advancement across browser polls and cron.
  acquired := pg_try_advisory_xact_lock(20260905);

  SELECT * INTO r
  FROM public.game_rounds
  WHERE status IN ('WAITING','COUNTDOWN','RUNNING','CRASHED','SETTLED')
  ORDER BY round_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    IF acquired THEN
      PERFORM public.create_next_round();
      SELECT * INTO r
      FROM public.game_rounds
      ORDER BY round_number DESC
      LIMIT 1;
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  IF acquired THEN
    IF r.status IN ('CRASHED','SETTLED')
       AND r.ended_at IS NOT NULL
       AND clock_timestamp() >= r.ended_at + interval '5 seconds' THEN
      PERFORM public.create_next_round();

      SELECT * INTO r
      FROM public.game_rounds
      ORDER BY round_number DESC
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF r.status IN ('WAITING','COUNTDOWN')
       AND clock_timestamp() >= r.created_at + interval '5 seconds' THEN
      PERFORM public.start_round(r.id::text);

      SELECT * INTO r
      FROM public.game_rounds
      WHERE id = r.id
      FOR UPDATE;
    END IF;

    IF r.status = 'RUNNING'
       AND r.started_at IS NOT NULL
       AND r.crash_point IS NOT NULL THEN
      -- Auto-cashouts are settled from server time. This is safe to call on
      -- every poll because each bet is locked and can settle only once.
      PERFORM public.settle_auto_cashouts(r.id::text);

      elapsed := greatest(
        0,
        extract(epoch FROM (clock_timestamp() - r.started_at))::numeric
      );
      crash_time := ln(greatest(r.crash_point, 1.00)) / 0.25;

      IF elapsed >= crash_time THEN
        PERFORM public.crash_round(r.id::text);

        SELECT * INTO r
        FROM public.game_rounds
        WHERE id = r.id;
      END IF;
    END IF;
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
    'crash_point', CASE
      WHEN r.status IN ('CRASHED','SETTLED') THEN r.crash_point
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_round()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_round()
TO authenticated;

COMMENT ON FUNCTION public.get_current_round() IS
'Pull-driven authoritative round state. PostgreSQL server time advances only due lifecycle transitions and settles auto-cashouts; browser never supplies outcome or financial values.';

COMMIT;
