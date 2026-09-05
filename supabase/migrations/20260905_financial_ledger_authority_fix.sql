-- SKY-BIRD — ledger compatibility for server-authoritative game RPCs.
-- place_bet/cashout/cancel already perform the wallet mutation while holding locks.
-- The ledger trigger must record those mutations without applying them twice.

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (
  type IN ('deposit','withdrawal','bet','bet_placed','cashout','bet_cashed_out','bet_cancelled','refund','referral_bonus')
);

CREATE OR REPLACE FUNCTION public.apply_financial_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE w numeric;
BEGIN
  SELECT available_balance INTO w FROM public.wallets WHERE user_id=NEW.user_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.type IN ('bet_placed','bet_cashed_out','bet_cancelled') THEN
      -- These entries are created only by SECURITY DEFINER game RPCs. The RPC has
      -- already changed the locked wallet. Validate the recorded resulting balance
      -- instead of applying the amount a second time.
      IF NEW.balance_after IS NULL OR abs(w-NEW.balance_after) > 0.000001 THEN
        RAISE EXCEPTION 'LEDGER_BALANCE_MISMATCH';
      END IF;
      NEW.currency := COALESCE(NEW.currency,'USD');
      RETURN NEW;
    END IF;

    IF NEW.type NOT IN ('deposit','withdrawal') THEN
      RAISE EXCEPTION 'DIRECT_FINANCIAL_TRANSACTION_FORBIDDEN';
    END IF;

    NEW.currency := COALESCE(NEW.currency,'USD');
    NEW.balance_before := w;
    IF NEW.type='withdrawal' THEN
      IF NEW.amount <= 0 OR w < NEW.amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
      UPDATE public.wallets SET available_balance=w-NEW.amount, updated_at=now() WHERE user_id=NEW.user_id;
      NEW.balance_after := w-NEW.amount;
    ELSE
      NEW.balance_after := w;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' THEN
    IF OLD.user_id<>NEW.user_id OR OLD.type<>NEW.type OR OLD.amount<>NEW.amount THEN
      RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_FIELDS';
    END IF;
    IF OLD.status=NEW.status THEN RETURN NEW; END IF;
    SELECT available_balance INTO w FROM public.wallets WHERE user_id=NEW.user_id FOR UPDATE;
    IF NEW.type='deposit' AND OLD.status='pending' AND NEW.status='completed' THEN
      UPDATE public.wallets SET available_balance=w+NEW.amount, updated_at=now() WHERE user_id=NEW.user_id;
      NEW.balance_before:=w; NEW.balance_after:=w+NEW.amount;
    ELSIF NEW.type='withdrawal' AND OLD.status IN ('pending','processing') AND NEW.status='cancelled' THEN
      UPDATE public.wallets SET available_balance=w+NEW.amount, updated_at=now() WHERE user_id=NEW.user_id;
      NEW.balance_before:=w; NEW.balance_after:=w+NEW.amount;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_financial_transaction ON public.transactions;
CREATE TRIGGER trg_apply_financial_transaction
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_financial_transaction();

REVOKE INSERT,UPDATE,DELETE ON public.transactions FROM anon,authenticated;
