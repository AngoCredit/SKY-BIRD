-- =============================================================================
-- SKY-BIRD — SAFE ROUND HISTORY RETENTION
--
-- Keep the financial/audit ledger intact. The game UI only needs a bounded
-- recent history. This RPC exposes the latest 50 completed rounds without
-- deleting bets or financial records.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_recent_round_history(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id text,
  round_number bigint,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  crash_point numeric,
  server_seed_hash text,
  client_seed text,
  nonce bigint,
  total_bets_amount numeric,
  total_payout_amount numeric,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    gr.id::text,
    gr.round_number,
    gr.status,
    gr.started_at,
    gr.ended_at,
    gr.crash_point,
    gr.server_seed_hash,
    gr.client_seed,
    gr.nonce,
    gr.total_bets_amount,
    gr.total_payout_amount,
    gr.created_at
  FROM public.game_rounds gr
  WHERE gr.status IN ('CRASHED', 'SETTLED')
    AND gr.crash_point IS NOT NULL
  ORDER BY gr.round_number DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 50));
$$;

REVOKE ALL ON FUNCTION public.get_recent_round_history(integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_round_history(integer)
TO authenticated;

COMMENT ON FUNCTION public.get_recent_round_history(integer) IS
'Bounded UI history. Keeps at most 50 completed rounds in the browser without deleting financial or audit records from PostgreSQL.';

COMMIT;
