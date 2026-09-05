-- =============================================================================
-- SKY-BIRD CRASH POINT FIX
-- Canonical unsigned 52-bit extraction from SHA-256 using NUMERIC arithmetic.
-- This migration does not modify existing rounds.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_crash_point(
  p_server_seed TEXT,
  p_client_seed TEXT,
  p_nonce BIGINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path=public,extensions,pg_temp
AS $$
DECLARE
  h BYTEA;
  first_56 NUMERIC;
  first_52 NUMERIC;
  u NUMERIC;
BEGIN
  h := extensions.digest(
    p_server_seed || ':' || p_client_seed || ':' || p_nonce::TEXT,
    'sha256'::TEXT
  );

  -- First 7 bytes are an unsigned 56-bit value.
  first_56 :=
      get_byte(h, 0)::NUMERIC * 72057594037927936
    + get_byte(h, 1)::NUMERIC * 281474976710656
    + get_byte(h, 2)::NUMERIC * 1099511627776
    + get_byte(h, 3)::NUMERIC * 4294967296
    + get_byte(h, 4)::NUMERIC * 16777216
    + get_byte(h, 5)::NUMERIC * 65536
    + get_byte(h, 6)::NUMERIC * 256
    + get_byte(h, 7)::NUMERIC;

  -- Equivalent to taking the first 52 bits of the hash.
  first_52 := floor(first_56 / 16::NUMERIC);

  -- 2^52 = 4503599627370496.
  u := first_52 / 4503599627370496::NUMERIC;

  -- Keep U strictly below 1 to avoid division by zero.
  IF u >= 1::NUMERIC THEN
    u := (4503599627370495::NUMERIC) / 4503599627370496::NUMERIC;
  END IF;

  RETURN greatest(
    1.00::NUMERIC,
    floor((0.925::NUMERIC / (1::NUMERIC - u)) * 100::NUMERIC)
      / 100::NUMERIC
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_round(p_round_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,extensions,pg_temp
AS $$
DECLARE
  r public.game_rounds%ROWTYPE;
  h TEXT;
  cp NUMERIC;
BEGIN
  SELECT * INTO r
  FROM public.game_rounds
  WHERE id::TEXT = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND';
  END IF;

  IF r.status NOT IN ('WAITING','COUNTDOWN') THEN
    RAISE EXCEPTION 'INVALID_ROUND_STATE';
  END IF;

  IF r.server_seed IS NULL OR r.server_seed_hash IS NULL THEN
    RAISE EXCEPTION 'ROUND_SEED_INVALID';
  END IF;

  h := encode(
    extensions.digest(
      r.server_seed || ':' || r.client_seed || ':' || r.nonce::TEXT,
      'sha256'::TEXT
    ),
    'hex'
  );

  IF h <> lower(r.server_seed_hash) THEN
    RAISE EXCEPTION 'SEED_COMMITMENT_MISMATCH';
  END IF;

  cp := public.calculate_crash_point(r.server_seed, r.client_seed, r.nonce);

  UPDATE public.game_rounds
  SET status='RUNNING',
      started_at=clock_timestamp(),
      crash_point=cp,
      updated_at=clock_timestamp()
  WHERE id::TEXT=p_round_id;

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

REVOKE ALL ON FUNCTION public.calculate_crash_point(TEXT,TEXT,BIGINT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_round(TEXT) FROM PUBLIC,anon,authenticated;

COMMIT;
