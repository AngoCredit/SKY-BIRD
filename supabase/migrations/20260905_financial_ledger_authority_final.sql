-- SKY-BIRD — final ledger compatibility for authoritative bet lifecycle.
-- The authoritative RPCs mutate the locked wallet atomically and then append a ledger event.
-- The trigger MUST NOT debit/credit the wallet a second time for bet events.

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (
  type IN ('deposit','withdrawal','bet','bet_placed','cashout','bet_cashed_out','refund','referral_bonus','bet_cancelled')
);

CREATE OR REPLACE FUNCTION public.apply_financial_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE w numeric;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.type IN ('deposit','withdrawal') THEN
      SELECT available_balance INTO w FROM public.wallets WHERE user_id=NEW.user_id FOR UPDATE;
      IF w IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
      NEW.currency := COALESCE(NEW.currency,'USD');
      NEW.balance_before := w;
      IF NEW.type='withdrawal' THEN
        IF NEW.amount <= 0 OR w < NEW.amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
        UPDATE public.wallets SET available_balance=w-NEW.amount,updated_at=clock_timestamp() WHERE user_id=NEW.user_id;
        NEW.balance_after := w-NEW.amount;
      ELSE
        NEW.balance_after := w;
      END IF;
      RETURN NEW;
    END IF;

    -- Bet events are append-only audit entries. Their wallet delta has already
    -- been applied by the locked authoritative RPC in the same transaction.
    IF NEW.type IN ('bet','bet_placed','cashout','bet_cashed_out','refund','referral_bonus','bet_cancelled') THEN
      IF NEW.amount IS NULL OR NEW.amount < 0 THEN RAISE EXCEPTION 'INVALID_LEDGER_AMOUNT'; END IF;
      NEW.currency := COALESCE(NEW.currency,'USD');
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'DIRECT_FINANCIAL_TRANSACTION_FORBIDDEN';
  END IF;

  IF TG_OP='UPDATE' THEN
    IF OLD.user_id<>NEW.user_id OR OLD.type<>NEW.type OR OLD.amount<>NEW.amount THEN
      RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_FIELDS';
    END IF;
    IF OLD.status=NEW.status THEN RETURN NEW; END IF;

    SELECT available_balance INTO w FROM public.wallets WHERE user_id=NEW.user_id FOR UPDATE;
    IF w IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

    IF NEW.type='deposit' AND OLD.status='pending' AND NEW.status='completed' THEN
      UPDATE public.wallets SET available_balance=w+NEW.amount,updated_at=clock_timestamp() WHERE user_id=NEW.user_id;
      NEW.balance_before:=w; NEW.balance_after:=w+NEW.amount;
    ELSIF NEW.type='withdrawal' AND OLD.status IN ('pending','processing') AND NEW.status='cancelled' THEN
      UPDATE public.wallets SET available_balance=w+NEW.amount,updated_at=clock_timestamp() WHERE user_id=NEW.user_id;
      NEW.balance_before:=w; NEW.balance_after:=w+NEW.amount;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

-- Canonical one-argument cashout endpoint used by the production browser.
DROP FUNCTION IF EXISTS public.cashout_bet(text);
CREATE OR REPLACE FUNCTION public.cashout_bet(p_bet_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  b public.bets%rowtype;
  r public.game_rounds%rowtype;
  w numeric;
  m numeric;
  payout numeric;
  tx uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO b FROM public.bets WHERE id::text=p_bet_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BET_NOT_FOUND'; END IF;
  IF b.status<>'active' THEN RAISE EXCEPTION 'BET_NOT_ACTIVE'; END IF;
  SELECT * INTO r FROM public.game_rounds WHERE id=b.round_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'RUNNING' OR r.started_at IS NULL OR r.crash_point IS NULL THEN RAISE EXCEPTION 'ROUND_ENDED'; END IF;

  m := LEAST(r.crash_point, floor(exp(0.25*extract(epoch from(clock_timestamp()-r.started_at)))*100)/100.0);
  IF m < 1.01 THEN RAISE EXCEPTION 'CASHOUT_TOO_EARLY'; END IF;
  payout := round(b.amount*m,2);

  SELECT available_balance INTO w FROM public.wallets WHERE user_id=v_uid FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

  UPDATE public.wallets SET available_balance=w+payout,updated_at=clock_timestamp() WHERE user_id=v_uid;
  UPDATE public.bets SET status='cashed_out',cashout_multiplier=m,payout=payout,updated_at=clock_timestamp() WHERE id=b.id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'BET_NOT_ACTIVE'; END IF;

  INSERT INTO public.transactions(user_id,type,amount,currency,balance_before,balance_after,reference,status,created_at)
  VALUES(v_uid,'bet_cashed_out',payout,'USD',w,w+payout,'CASHOUT-'||r.round_number,'completed',clock_timestamp())
  RETURNING id INTO tx;

  RETURN jsonb_build_object('success',true,'payout',payout,'multiplier',m,'balance_after',w+payout,'transaction_id',tx,'bet_id',b.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cashout_bet(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.cashout_bet(text) TO authenticated;

-- Prevent the obsolete browser API from being selected accidentally.
REVOKE EXECUTE ON FUNCTION public.cashout_bet(text,numeric,text,text) FROM public,anon,authenticated;
