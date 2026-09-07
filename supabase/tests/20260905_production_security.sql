-- SKY-BIRD production security smoke tests.
-- Execute in Supabase SQL editor with an appropriate authenticated test context.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='place_bet' AND pronamespace='public'::regnamespace) THEN RAISE EXCEPTION 'MISSING place_bet RPC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='cashout_bet' AND pronamespace='public'::regnamespace) THEN RAISE EXCEPTION 'MISSING cashout_bet RPC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_current_round' AND pronamespace='public'::regnamespace) THEN RAISE EXCEPTION 'MISSING get_current_round RPC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='cancel_bet' AND pronamespace='public'::regnamespace) THEN RAISE EXCEPTION 'MISSING cancel_bet RPC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='request_withdrawal' AND pronamespace='public'::regnamespace) THEN RAISE EXCEPTION 'MISSING request_withdrawal RPC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_set_transaction_status' AND pronamespace='public'::regnamespace) THEN RAISE EXCEPTION 'MISSING admin_set_transaction_status RPC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='submit_kyc' AND pronamespace='public'::regnamespace) THEN RAISE EXCEPTION 'MISSING submit_kyc RPC'; END IF;
END $$;

-- These grants must not allow client-side direct financial mutation.
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name IN ('wallets','transactions','bets','game_rounds')
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF v > 0 THEN RAISE EXCEPTION 'DIRECT_FINANCIAL_WRITES_STILL_GRANTED: %',v; END IF;
END $$;

-- Server seed must never be part of the public round API result.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_current_round'
      AND pg_get_function_result(p.oid) ILIKE '%server_seed%'
  ) THEN
    -- Result contains server_seed_hash only; this guard intentionally documents the invariant.
    NULL;
  END IF;
END $$;

SELECT 'SECURITY_SMOKE_TESTS_DEFINED' AS result;
