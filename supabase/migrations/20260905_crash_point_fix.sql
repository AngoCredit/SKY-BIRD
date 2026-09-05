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
  first_52 NUMERIC;
  u NUMERIC;
BEGIN
  h := extensions.digest(
    p_server_seed || ':' || p_client_seed || ':' || p_nonce::TEXT,
    'sha256'::TEXT
  );

  -- Exact first 52 bits of SHA-256, represented as an unsigned NUMERIC.
  -- Bytes 0..5 contribute 44..4 bits; the high nibble of byte 6 contributes 4 bits.
  first_52 :=
      get_byte(h, 0)::NUMERIC * 17592186044416
    + get_byte(h, 1)::NUMERIC * 68719476736
    + get_byte(h, 2)::NUMERIC * 268435456
    + get_byte(h, 3)::NUMERIC * 1048576
    + get_byte(h, 4)::NUMERIC * 4096
    + get_byte(h, 5)::NUMERIC * 16
    + floor(get_byte(h, 6)::NUMERIC / 16);

  -- 2^52 = 4503599627370496.
  u := first_52 / 4503599627370496::NUMERIC;

  IF u >= 1::NUMERIC THEN
    u := 4503599627370495::NUMERIC / 4503599627370496::NUMERIC;
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
