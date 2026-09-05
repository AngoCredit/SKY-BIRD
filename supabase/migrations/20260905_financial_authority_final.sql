-- =============================================================================
-- SKY-BIRD — FINAL FINANCIAL AUTHORITY
-- The live transactions table has no financial trigger. Therefore withdrawal
-- reservation and admin wallet effects are performed explicitly and atomically
-- inside SECURITY DEFINER RPCs.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_method text DEFAULT 'Airtm',
  p_details text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wallet public.wallets%ROWTYPE;
  v_user public.profiles%ROWTYPE;
  v_used numeric;
  v_limit numeric;
  v_reference text;
  v_tx public.transactions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF p_amount IS NULL OR p_amount < 10 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'INVALID_WITHDRAWAL_AMOUNT';
  END IF;

  SELECT * INTO v_user
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  SELECT COALESCE(SUM(amount),0)
    INTO v_used
  FROM public.transactions
  WHERE user_id = v_uid
    AND type = 'withdrawal'
    AND status NOT IN ('failed','cancelled')
    AND created_at >= date_trunc('day', clock_timestamp());

  v_limit := CASE WHEN COALESCE(v_user.is_verified,false) THEN 500 ELSE 100 END;

  IF v_used + p_amount > v_limit THEN
    RAISE EXCEPTION 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED';
  END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE user_id = v_uid
      AND reference = btrim(p_idempotency_key)
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success',true,
        'transaction_id',v_tx.id,
        'status',v_tx.status,
        'balance_after',v_wallet.available_balance
      );
    END IF;

    v_reference := btrim(p_idempotency_key);
  ELSE
    v_reference := 'AIRTM-WTH-' || upper(substr(md5(random()::text || clock_timestamp()::text),1,10));
  END IF;

  -- Reserve/debit the withdrawal atomically before creating the pending ledger row.
  UPDATE public.wallets
  SET available_balance = available_balance - p_amount,
      locked_balance = locked_balance + p_amount,
      updated_at = clock_timestamp()
  WHERE user_id = v_uid;

  INSERT INTO public.transactions (
    user_id,type,amount,currency,balance_before,balance_after,reference,
    details,status,method,processing_time_text,created_at
  ) VALUES (
    v_uid,'withdrawal',p_amount,'USD',
    v_wallet.available_balance,
    v_wallet.available_balance - p_amount,
    v_reference,p_details,'pending',
    COALESCE(NULLIF(p_method,''),'Airtm'),
    '15 a 30 minutos (Aprovação Admin)',
    clock_timestamp()
  )
  RETURNING * INTO v_tx;

  RETURN jsonb_build_object(
    'success',true,
    'transaction_id',v_tx.id,
    'status',v_tx.status,
    'balance_after',v_wallet.available_balance - p_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_transaction_status(
  p_transaction_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tx public.transactions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_admin boolean;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND role = 'admin' AND status = 'active'
  ) INTO v_admin;

  IF NOT v_admin THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  IF p_status NOT IN ('completed','failed','cancelled') THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_STATUS';
  END IF;

  SELECT * INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSACTION_NOT_FOUND';
  END IF;

  IF v_tx.status NOT IN ('pending','processing') THEN
    RAISE EXCEPTION 'TRANSACTION_NOT_PENDING';
  END IF;

  IF v_tx.type NOT IN ('deposit','withdrawal') THEN
    RAISE EXCEPTION 'UNSUPPORTED_TRANSACTION_TYPE';
  END IF;

  IF v_tx.type = 'deposit' AND p_status = 'completed' THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_tx.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND';
    END IF;

    v_before := v_wallet.available_balance;
    v_after := v_before + v_tx.amount;

    UPDATE public.wallets
    SET available_balance = v_after,
        updated_at = clock_timestamp()
    WHERE user_id = v_tx.user_id;

    UPDATE public.transactions
    SET status = 'completed',
        balance_before = v_before,
        balance_after = v_after,
        processing_time_text = COALESCE(p_reason,'Aprovado pelo Admin')
    WHERE id = p_transaction_id;

  ELSIF v_tx.type = 'withdrawal' AND p_status = 'completed' THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_tx.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND';
    END IF;

    IF v_wallet.locked_balance < v_tx.amount THEN
      RAISE EXCEPTION 'WITHDRAWAL_LOCK_NOT_FOUND';
    END IF;

    UPDATE public.wallets
    SET locked_balance = locked_balance - v_tx.amount,
        updated_at = clock_timestamp()
    WHERE user_id = v_tx.user_id;

    UPDATE public.transactions
    SET status = 'completed',
        processing_time_text = COALESCE(p_reason,'Aprovado pelo Admin')
    WHERE id = p_transaction_id;

  ELSIF v_tx.type = 'withdrawal' AND p_status IN ('failed','cancelled') THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_tx.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND';
    END IF;

    IF v_wallet.locked_balance < v_tx.amount THEN
      RAISE EXCEPTION 'WITHDRAWAL_LOCK_NOT_FOUND';
    END IF;

    v_before := v_wallet.available_balance;
    v_after := v_before + v_tx.amount;

    UPDATE public.wallets
    SET available_balance = v_after,
        locked_balance = locked_balance - v_tx.amount,
        updated_at = clock_timestamp()
    WHERE user_id = v_tx.user_id;

    UPDATE public.transactions
    SET status = p_status,
        balance_before = v_before,
        balance_after = v_after,
        processing_time_text = COALESCE(p_reason,'Processado pelo Admin')
    WHERE id = p_transaction_id;

  ELSE
    UPDATE public.transactions
    SET status = p_status,
        processing_time_text = COALESCE(p_reason,'Processado pelo Admin')
    WHERE id = p_transaction_id;
  END IF;

  RETURN jsonb_build_object(
    'success',true,
    'transaction_id',v_tx.id,
    'status',p_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric,text,text,text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric,text,text,text)
TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_transaction_status(uuid,text,text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_transaction_status(uuid,text,text)
TO authenticated;

COMMIT;
