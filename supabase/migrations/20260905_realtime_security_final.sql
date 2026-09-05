-- SKY-BIRD — sensitive data must not be broadcast through generic Realtime.
-- The client uses protected RPC/polling for these resources.

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY[
      'wallets','transactions','bets','profiles','kyc_verifications',
      'support_conversations','support_messages','audit_logs','game_rounds'
    ] LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.%I', t);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not remove % from supabase_realtime: %', t, SQLERRM;
      END;
    END LOOP;
  END IF;
END $$;
