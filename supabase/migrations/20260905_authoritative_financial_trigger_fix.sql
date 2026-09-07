-- SKY-BIRD — financial trigger compatibility fix
-- The authoritative bet/cashout RPCs are SECURITY DEFINER and authenticated clients
-- have no INSERT privilege on transactions. Therefore server-generated ledger entries
-- must be accepted by the trigger while direct client inserts remain blocked by grants/RLS.

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (
  type IN (
    'deposit',
    'withdrawal',
    'bet',
    'bet_placed',
    'cashout',
    'bet_cashed_out',
    'refund',
    'bet_cancelled',
    'referral_bonus'
  )
);

CREATE OR REPLACE FUNCTION public.apply_financial_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  w numeric;
BEGIN
  -- Server-side bet/cashout/refund ledger rows are created only by SECURITY DEFINER RPCs.
  -- Client roles have INSERT/UPDATE/DELETE revoked on transactions.
  IF TG_OP = 'INSERT' THEN
    IF NEW.type IN ('bet_placed','bet_cashed_out','refund','bet_cancelled','bet','cashout','referral_bonus') THEN
      RETURN NEW;
    END IF;

    IF NEW.type NOT IN ('deposit','withdrawal') THEN
      RAISE EXCEPTION 'DIRECT_FINANCIAL_TRANSACTION_FORBIDDEN';
    END IF;

    SELECT available_balance INTO w
      FROM public.wallets
     WHERE user_id = NEW.user_id
     FOR UPDATE;

    IF w IS NULL THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND';
    END IF;

    NEW.currency := COALESCE(NEW.currency, 'USD');
    NEW.balance_before := w;

    IF NEW.type = 'withdrawal' THEN
      IF NEW.amount <= 0 OR w < NEW.amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
      END IF;

      UPDATE public.wallets
         SET available_balance = w - NEW.amount,
             updated_at = now()
       WHERE user_id = NEW.user_id;

      NEW.balance_after := w - NEW.amount;
    ELSE
      -- Deposit remains pending until an authorized server/admin action completes it.
      NEW.balance_after := w;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_id <> NEW.user_id
       OR OLD.type <> NEW.type
       OR OLD.amount <> NEW.amount THEN
      RAISE EXCEPTION 'IMMUTABLE_FINANCIAL_FIELDS';
    END IF;

    IF OLD.status = NEW.status THEN
      RETURN NEW;
    END IF;

    IF NEW.type NOT IN ('deposit','withdrawal') THEN
      RETURN NEW;
    END IF;

    SELECT available_balance INTO w
      FROM public.wallets
     WHERE user_id = NEW.user_id
     FOR UPDATE;

    IF w IS NULL THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND';
    END IF;

    IF NEW.type = 'deposit'
       AND OLD.status = 'pending'
       AND NEW.status = 'completed' THEN
      UPDATE public.wallets
         SET available_balance = w + NEW.amount,
             updated_at = now()
       WHERE user_id = NEW.user_id;
      NEW.balance_before := w;
      NEW.balance_after := w + NEW.amount;

    ELSIF NEW.type = 'withdrawal'
       AND OLD.status IN ('pending','processing')
       AND NEW.status = 'cancelled' THEN
      UPDATE public.wallets
         SET available_balance = w + NEW.amount,
             updated_at = now()
       WHERE user_id = NEW.user_id;
      NEW.balance_before := w;
      NEW.balance_after := w + NEW.amount;
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

-- Repair the cancellation RPC created by the previous authoritative-flow migration.
-- Only active bets are cancellable because that is the live bets_status_check.
CREATE OR REPLACE FUNCTION public.cancel_bet(p_bet_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_bet public.bets%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_before numeric;
  v_after numeric;
  v_tx_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_bet
    FROM public.bets
   WHERE id::text = trim(p_bet_id)
     AND user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BET_NOT_FOUND';
  END IF;

  IF v_bet.status <> 'active' THEN
    RAISE EXCEPTION 'BET_NOT_CANCELLABLE';
  END IF;

  PERFORM 1
    FROM public.game_rounds gr
   WHERE gr.id = v_bet.round_id
     AND gr.status IN ('WAITING','COUNTDOWN')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_ALREADY_STARTED';
  END IF;

  SELECT * INTO v_wallet
    FROM public.wallets
   WHERE user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  v_before := v_wallet.available_balance;
  v_after := v_before + v_bet.amount;

  UPDATE public.wallets
     SET available_balance = v_after,
         updated_at = clock_timestamp()
   WHERE user_id = v_uid;

  UPDATE public.bets
     SET status = 'cancelled',
         payout = 0,
         updated_at = clock_timestamp()
   WHERE id = v_bet.id;

  INSERT INTO public.transactions (
    user_id, type, amount, currency, balance_before, balance_after,
    reference, status, description, created_at, updated_at
  ) VALUES (
    v_uid,
    'bet_cancelled',
    v_bet.amount,
    COALESCE(v_wallet.currency,'USD'),
    v_before,
    v_after,
    'BET-CANCEL-' || v_bet.id::text,
    'completed',
    'Bet cancelled before round start',
    clock_timestamp(),
    clock_timestamp()
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'bet_id', v_bet.id::text,
    'transaction_id', v_tx_id::text,
    'balance_before', v_before,
    'balance_after', v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_bet(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_bet(text) TO authenticated;

COMMENT ON FUNCTION public.apply_financial_transaction() IS
'Financial ledger trigger: client roles cannot write transactions; server-authoritative RPC ledger types bypass balance mutation here.';
COMMENT ON FUNCTION public.cancel_bet(text) IS
'Atomic server-side cancellation of an active bet before WAITING/COUNTDOWN round start.';
