-- =============================================================================
-- SERVER ROUND ENGINE
-- One authoritative database tick. pg_cron runs it every second.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.tick_game_engine()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  r RECORD;
  age INTERVAL;
  flight_seconds NUMERIC;
BEGIN
  SELECT * INTO r FROM public.game_rounds ORDER BY round_number DESC LIMIT 1 FOR UPDATE;

  IF r.id IS NULL THEN
    PERFORM public.create_next_round();
    RETURN jsonb_build_object('action','created_initial_round');
  END IF;

  IF r.status IN ('CRASHED','SETTLED') THEN
    IF r.started_at IS NULL OR clock_timestamp() - r.started_at >= interval '5 seconds' THEN
      PERFORM public.create_next_round();
      RETURN jsonb_build_object('action','created_next_round','after',r.round_number);
    END IF;
    RETURN jsonb_build_object('action','waiting_after_crash','round',r.round_number);
  END IF;

  IF r.status = 'WAITING' THEN
    -- Give the betting window a stable five seconds from creation.
    IF clock_timestamp() - COALESCE(r.created_at,r.updated_at,r.started_at,clock_timestamp()) >= interval '5 seconds' THEN
      PERFORM public.start_round(r.id::text);
      RETURN jsonb_build_object('action','started','round',r.round_number);
    END IF;
    RETURN jsonb_build_object('action','betting','round',r.round_number);
  END IF;

  IF r.status = 'COUNTDOWN' THEN
    IF clock_timestamp() - COALESCE(r.created_at,r.updated_at,clock_timestamp()) >= interval '5 seconds' THEN
      PERFORM public.start_round(r.id::text);
      RETURN jsonb_build_object('action','started','round',r.round_number);
    END IF;
    RETURN jsonb_build_object('action','countdown','round',r.round_number);
  END IF;

  IF r.status = 'RUNNING' THEN
    IF r.started_at IS NULL OR r.crash_point IS NULL THEN
      RETURN jsonb_build_object('action','invalid_running_round','round',r.round_number);
    END IF;

    flight_seconds := ln(greatest(r.crash_point,1.0)) / 0.25;
    IF clock_timestamp() - r.started_at >= make_interval(secs => flight_seconds) THEN
      PERFORM public.crash_round(r.id::text);
      RETURN jsonb_build_object('action','crashed','round',r.round_number,'crash_point',r.crash_point);
    END IF;

    RETURN jsonb_build_object('action','running','round',r.round_number);
  END IF;

  RETURN jsonb_build_object('action','noop','round',r.round_number,'status',r.status);
END;
$$;

REVOKE ALL ON FUNCTION public.tick_game_engine() FROM PUBLIC, anon, authenticated;

-- Supabase Cron supports sub-minute schedules on supported Postgres versions.
-- Re-running the migration is safe because the job is first removed by name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.unschedule('skybird-game-engine-1s');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.schedule(
      'skybird-game-engine-1s',
      '1 second',
      'SELECT public.tick_game_engine();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron job was not scheduled automatically: %', SQLERRM;
END $$;
