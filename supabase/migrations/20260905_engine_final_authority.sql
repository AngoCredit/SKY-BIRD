-- =============================================================================
-- SKY-BIRD — FINAL ENGINE AUTHORITY
-- Fixes stale scheduler assumptions, prevents multiple active rounds, and
-- removes the last game_rounds.updated_at dependency from the lifecycle.
-- =============================================================================

BEGIN;

-- There must be exactly one active lifecycle round at a time.
CREATE UNIQUE INDEX IF NOT EXISTS game_rounds_one_active_round_idx
ON public.game_rounds ((status))
WHERE status IN ('WAITING','COUNTDOWN','RUNNING');

-- Correct server-authoritative round start. game_rounds has no updated_at.
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
    extensions.digest(r.server_seed, 'sha256'),
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
    'nonce', r.nonce
  );
END;
$$;

-- One database-authoritative tick. The persistent worker calls this at ~250ms.
-- pg_cron remains a temporary fallback until the worker is proven online.
CREATE OR REPLACE FUNCTION public.tick_game_engine()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  elapsed numeric;
  crash_time numeric;
  auto_result jsonb;
BEGIN
  -- Protect the lifecycle even when fallback cron and worker overlap.
  IF NOT pg_try_advisory_xact_lock(20260905) THEN
    RETURN jsonb_build_object('action','busy');
  END IF;

  SELECT * INTO r
  FROM public.game_rounds
  ORDER BY round_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.create_next_round();
    RETURN jsonb_build_object('action','created_initial_round');
  END IF;

  IF r.status IN ('CRASHED','SETTLED') THEN
    IF r.ended_at IS NOT NULL
       AND clock_timestamp() - r.ended_at >= interval '5 seconds' THEN
      PERFORM public.create_next_round();
      RETURN jsonb_build_object(
        'action','created_next_round',
        'after',r.round_number
      );
    END IF;

    RETURN jsonb_build_object(
      'action','waiting_after_crash',
      'round',r.round_number
    );
  END IF;

  IF r.status = 'WAITING' THEN
    IF r.created_at IS NOT NULL
       AND clock_timestamp() - r.created_at >= interval '5 seconds' THEN
      PERFORM public.start_round(r.id::text);
      RETURN jsonb_build_object(
        'action','started',
        'round',r.round_number
      );
    END IF;

    RETURN jsonb_build_object(
      'action','betting',
      'round',r.round_number
    );
  END IF;

  IF r.status = 'COUNTDOWN' THEN
    IF r.created_at IS NOT NULL
       AND clock_timestamp() - r.created_at >= interval '5 seconds' THEN
      PERFORM public.start_round(r.id::text);
      RETURN jsonb_build_object(
        'action','started',
        'round',r.round_number
      );
    END IF;

    RETURN jsonb_build_object(
      'action','countdown',
      'round',r.round_number
    );
  END IF;

  IF r.status = 'RUNNING' THEN
    IF r.started_at IS NULL OR r.crash_point IS NULL THEN
      RETURN jsonb_build_object(
        'action','invalid_running_round',
        'round',r.round_number
      );
    END IF;

    auto_result := public.settle_auto_cashouts(r.id::text);

    elapsed := greatest(
      0,
      extract(epoch FROM (clock_timestamp() - r.started_at))::numeric
    );

    crash_time := ln(greatest(r.crash_point,1.00)) / 0.25;

    IF elapsed >= crash_time THEN
      PERFORM public.crash_round(r.id::text);

      RETURN jsonb_build_object(
        'action','crashed',
        'round',r.round_number,
        'crash_point',r.crash_point,
        'auto_cashouts',COALESCE(auto_result->'settled','0'::jsonb)
      );
    END IF;

    RETURN jsonb_build_object(
      'action','running',
      'round',r.round_number,
      'auto_cashouts',COALESCE(auto_result->'settled','0'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'action','noop',
    'round',r.round_number,
    'status',r.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_round(text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.tick_game_engine()
FROM PUBLIC, anon, authenticated;

COMMIT;
