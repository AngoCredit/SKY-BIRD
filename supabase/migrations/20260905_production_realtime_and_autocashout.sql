-- SKY-BIRD production hardening
-- 1) Keep sensitive base tables out of Supabase Realtime publication.
--    The application must use RLS-protected queries/RPCs instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.transactions; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.wallets; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.bets; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.support_messages; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.support_conversations; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.kyc_verifications; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.audit_logs; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.game_rounds; EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL; END;
  END IF;
END $$;

-- 2) Server-authoritative auto-cashout.
-- The browser never triggers or calculates settlement. PostgreSQL derives the
-- current multiplier from started_at and settles only eligible active bets.
CREATE OR REPLACE FUNCTION public.settle_auto_cashouts(p_round_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_round public.game_rounds%rowtype;
  v_bet public.bets%rowtype;
  v_wallet public.wallets%rowtype;
  v_now timestamptz := clock_timestamp();
  v_elapsed numeric;
  v_multiplier numeric;
  v_target numeric;
  v_payout numeric;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_round
  FROM public.game_rounds
  WHERE id=p_round_id
  FOR UPDATE;

  IF NOT FOUND OR v_round.status <> 'RUNNING' OR v_round.started_at IS NULL OR v_round.crash_point IS NULL THEN
    RETURN jsonb_build_object('settled',0,'total',0);
  END IF;

  v_elapsed := greatest(extract(epoch FROM (v_now-v_round.started_at)),0);
  v_multiplier := floor(exp(0.25*v_elapsed)*100)/100;
  v_multiplier := greatest(1.00,v_multiplier);

  -- Never auto-cashout at or beyond the authoritative crash point.
  IF v_multiplier >= v_round.crash_point THEN
    RETURN jsonb_build_object('settled',0,'total',0,'multiplier',v_multiplier);
  END IF;

  FOR v_bet IN
    SELECT * FROM public.bets
    WHERE round_id=p_round_id
      AND status='active'
      AND coalesce(is_bot,false)=false
      AND auto_cashout IS NOT NULL
      AND auto_cashout >= 1.01
      AND auto_cashout <= v_multiplier
    FOR UPDATE
  LOOP
    v_target := greatest(1.01, v_bet.auto_cashout);
    v_payout := round(v_bet.amount*v_target,2);

    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id=v_bet.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.bets
    SET status='cashed_out',
        cashout_multiplier=v_target,
        payout=v_payout,
        updated_at=v_now
    WHERE id=v_bet.id AND status='active';

    IF FOUND THEN
      UPDATE public.wallets
      SET locked_balance=greatest(locked_balance-v_bet.amount,0),
          available_balance=available_balance+v_payout,
          updated_at=v_now
      WHERE user_id=v_bet.user_id;

      INSERT INTO public.transactions(user_id,type,amount,status,description,reference,created_at)
      VALUES(v_bet.user_id,'bet_cashed_out',v_payout,'completed',
             'Auto cashout',v_bet.id::text,v_now);

      v_count := v_count+1;
      v_total := v_total+v_payout;
    END IF;
  END LOOP;

  UPDATE public.game_rounds
  SET total_payout_amount=(SELECT coalesce(sum(payout),0) FROM public.bets WHERE round_id=p_round_id AND payout IS NOT NULL)
  WHERE id=p_round_id;

  RETURN jsonb_build_object('settled',v_count,'total',v_total,'multiplier',v_multiplier);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_auto_cashouts(text) FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public.settle_auto_cashouts(text) IS 'Server-only automatic cashout settlement derived from database time; never callable by clients.';
