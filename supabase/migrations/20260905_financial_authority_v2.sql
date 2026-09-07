-- SKY-BIRD — financial authority v2
-- All player/admin financial mutations go through SECURITY DEFINER RPCs.

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (
  type IN ('deposit','withdrawal','bet','bet_placed','cashout','bet_cashed_out','refund','referral_bonus','bet_cancelled')
);

CREATE OR REPLACE FUNCTION public.request_deposit(
  p_amount numeric,
  p_method text DEFAULT 'Airtm',
  p_reference text DEFAULT NULL,
  p_details text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := (select auth.uid()); v_wallet public.wallets%rowtype; v_tx public.transactions%rowtype;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_amount < 1 OR p_amount > 100000 THEN RAISE EXCEPTION 'INVALID_DEPOSIT_AMOUNT'; END IF;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  INSERT INTO public.transactions(user_id,type,amount,currency,balance_before,balance_after,reference,details,status,method,processing_time_text,created_at)
  VALUES(v_uid,'deposit',p_amount,'USD',v_wallet.available_balance,v_wallet.available_balance,
    COALESCE(NULLIF(p_reference,''),'AIRTM-DEP-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10))),p_details,'pending',coalesce(nullif(p_method,''),'Airtm'),'Aguardando Confirmação Admin',clock_timestamp())
  RETURNING * INTO v_tx;
  RETURN jsonb_build_object('success',true,'transaction_id',v_tx.id,'status',v_tx.status,'balance_after',v_wallet.available_balance);
END; $$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_method text DEFAULT 'Airtm',
  p_details text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := (select auth.uid()); v_wallet public.wallets%rowtype; v_user public.profiles%rowtype; v_used numeric; v_limit numeric; v_tx public.transactions%rowtype;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_amount < 10 OR p_amount > 100000 THEN RAISE EXCEPTION 'INVALID_WITHDRAWAL_AMOUNT'; END IF;
  SELECT * INTO v_user FROM public.profiles WHERE id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_wallet.available_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
  SELECT coalesce(sum(amount),0) INTO v_used FROM public.transactions
    WHERE user_id=v_uid AND type='withdrawal' AND status NOT IN ('failed','cancelled')
      AND created_at >= date_trunc('day', clock_timestamp());
  v_limit := CASE WHEN coalesce(v_user.is_verified,false) THEN 500 ELSE 100 END;
  IF v_used + p_amount > v_limit THEN RAISE EXCEPTION 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED'; END IF;
  IF p_idempotency_key IS NOT NULL AND EXISTS(select 1 from public.transactions where user_id=v_uid and reference=p_idempotency_key) THEN
    SELECT * INTO v_tx FROM public.transactions WHERE user_id=v_uid and reference=p_idempotency_key LIMIT 1;
    RETURN jsonb_build_object('success',true,'transaction_id',v_tx.id,'status',v_tx.status,'balance_after',v_wallet.available_balance);
  END IF;
  INSERT INTO public.transactions(user_id,type,amount,currency,balance_before,balance_after,reference,details,status,method,processing_time_text,created_at)
  VALUES(v_uid,'withdrawal',p_amount,'USD',v_wallet.available_balance,v_wallet.available_balance-p_amount,
    COALESCE(NULLIF(p_idempotency_key,''),'AIRTM-WTH-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10))),p_details,'pending',coalesce(nullif(p_method,''),'Airtm'),'15 a 30 minutos (Aprovação Admin)',clock_timestamp())
  RETURNING * INTO v_tx;
  RETURN jsonb_build_object('success',true,'transaction_id',v_tx.id,'status',v_tx.status,'balance_after',v_tx.balance_after);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_transaction_status(
  p_transaction_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := (select auth.uid()); v_admin boolean; v_tx public.transactions%rowtype;
BEGIN
  SELECT EXISTS(select 1 from public.profiles where id=v_uid and role='admin' and status='active') INTO v_admin;
  IF NOT v_admin THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_status NOT IN ('completed','failed','cancelled') THEN RAISE EXCEPTION 'INVALID_TRANSACTION_STATUS'; END IF;
  SELECT * INTO v_tx FROM public.transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSACTION_NOT_FOUND'; END IF;
  IF v_tx.status NOT IN ('pending','processing') THEN RAISE EXCEPTION 'TRANSACTION_NOT_PENDING'; END IF;
  IF v_tx.type NOT IN ('deposit','withdrawal') THEN RAISE EXCEPTION 'UNSUPPORTED_TRANSACTION_TYPE'; END IF;
  UPDATE public.transactions SET status=p_status, processing_time_text=COALESCE(p_reason, CASE WHEN p_status='completed' THEN 'Aprovado pelo Admin' ELSE 'Processado pelo Admin' END) WHERE id=p_transaction_id;
  RETURN jsonb_build_object('success',true,'transaction_id',v_tx.id,'status',p_status);
END; $$;

REVOKE EXECUTE ON FUNCTION public.request_deposit(numeric,text,text,text) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric,text,text,text) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_transaction_status(uuid,text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.request_deposit(numeric,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_transaction_status(uuid,text,text) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated,anon;

COMMENT ON FUNCTION public.request_deposit(numeric,text,text,text) IS 'Server-authoritative deposit request; never credits balance directly.';
COMMENT ON FUNCTION public.request_withdrawal(numeric,text,text,text) IS 'Server-authoritative withdrawal request; trigger atomically reserves balance.';
COMMENT ON FUNCTION public.admin_set_transaction_status(uuid,text,text) IS 'Admin-only transaction status transition; wallet effects are performed by ledger trigger.';
