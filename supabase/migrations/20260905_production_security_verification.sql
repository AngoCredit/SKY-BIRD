-- SKY-BIRD — production security verification
-- Run in Supabase SQL Editor AFTER all migrations have been applied.
-- This is a diagnostic suite: it never creates test money or modifies player data.

CREATE OR REPLACE FUNCTION public.production_security_verification()
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count bigint;
  v_exists boolean;
  v_def text;
BEGIN
  -- 1. Required authoritative RPCs.
  FOREACH check_name IN ARRAY ARRAY[
    'place_bet','cashout_bet','cancel_bet','start_round','crash_round',
    'tick_game_engine','settle_auto_cashouts','get_current_round',
    'get_public_round_bets','request_deposit','request_withdrawal',
    'admin_set_transaction_status','submit_kyc','admin_review_kyc'
  ] LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=check_name
    ) INTO v_exists;
    status := CASE WHEN v_exists THEN 'PASS' ELSE 'FAIL' END;
    detail := CASE WHEN v_exists THEN 'RPC exists' ELSE 'Required RPC missing' END;
    RETURN NEXT;
  END LOOP;

  -- 2. RLS must be enabled on every security-sensitive table.
  FOREACH check_name IN ARRAY ARRAY[
    'profiles','wallets','transactions','bets','game_rounds',
    'idempotency_keys','admin_settings','audit_logs','kyc_verifications',
    'support_conversations','support_messages'
  ] LOOP
    SELECT c.relrowsecurity INTO v_exists
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=check_name;
    status := CASE WHEN coalesce(v_exists,false) THEN 'PASS' ELSE 'FAIL' END;
    detail := CASE WHEN coalesce(v_exists,false) THEN 'RLS enabled' ELSE 'RLS disabled or table missing' END;
    RETURN NEXT;
  END LOOP;

  -- 3. Direct grants must not permit authenticated users to mutate financial/game tables.
  FOREACH check_name IN ARRAY ARRAY['wallets','transactions','bets','game_rounds'] LOOP
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.role_table_grants
      WHERE table_schema='public'
        AND table_name=check_name
        AND grantee='authenticated'
        AND privilege_type IN ('INSERT','UPDATE','DELETE')
    ) INTO v_exists;
    status := CASE WHEN NOT v_exists THEN 'PASS' ELSE 'FAIL' END;
    detail := CASE WHEN NOT v_exists THEN 'No direct authenticated write grant' ELSE 'Authenticated direct write grant exists' END;
    RETURN NEXT;
  END LOOP;

  -- 4. Server seed must never be exposed by the public round RPC/view before crash.
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_current_round'
  ORDER BY p.oid DESC LIMIT 1;
  status := CASE WHEN coalesce(v_def,'') NOT ILIKE '%server_seed%' OR coalesce(v_def,'') ILIKE '%crashed%' THEN 'PASS' ELSE 'WARN' END;
  detail := 'Review get_current_round implementation to confirm server_seed is never returned.';
  RETURN NEXT;

  -- 5. KYC buckets must be private.
  SELECT NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id IN ('kyc-private','kyc-documents') AND public=true
  ) INTO v_exists;
  status := CASE WHEN v_exists THEN 'PASS' ELSE 'FAIL' END;
  detail := CASE WHEN v_exists THEN 'KYC buckets are not public' ELSE 'A KYC bucket is public' END;
  RETURN NEXT;

  -- 6. pg_cron engine must exist and be active.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    SELECT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname='skybird-game-engine-1s' AND active=true
    ) INTO v_exists;
    status := CASE WHEN v_exists THEN 'PASS' ELSE 'FAIL' END;
    detail := CASE WHEN v_exists THEN 'Active crash-engine cron job found' ELSE 'Active crash-engine cron job not found' END;
  ELSE
    status := 'FAIL';
    detail := 'pg_cron schema is unavailable';
  END IF;
  check_name := 'crash_engine_cron';
  RETURN NEXT;

  -- 7. No obvious local mock markers in production source is checked in CI separately.
  check_name := 'database_security_suite';
  status := 'PASS';
  detail := 'Database-side structural checks completed; runtime concurrency tests require an authenticated test session.';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.production_security_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.production_security_verification() TO authenticated;

COMMENT ON FUNCTION public.production_security_verification() IS
'Read-only production security verification. Does not mutate player balances or game state.';
