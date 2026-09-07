-- SKY-BIRD — private KYC storage
-- Documents are stored in a private bucket. Database keeps object paths, never base64 payloads.

INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-private','kyc-private',false)
ON CONFLICT (id) DO UPDATE SET public=false;

CREATE OR REPLACE FUNCTION public.submit_kyc(
  p_id_document_path text,
  p_selfie_path text,
  p_airtm_account text,
  p_whatsapp_number text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := (select auth.uid()); v_profile public.profiles%rowtype; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_id_document_path IS NULL OR p_selfie_path IS NULL THEN RAISE EXCEPTION 'KYC_DOCUMENTS_REQUIRED'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  DELETE FROM public.kyc_verifications WHERE user_id=v_uid AND status='pending';
  INSERT INTO public.kyc_verifications(user_id,user_name,user_email,id_document_url,selfie_url,airtm_account,whatsapp_number,status,submitted_at)
  VALUES(v_uid,v_profile.name,v_profile.email,p_id_document_path,p_selfie_path,trim(p_airtm_account),trim(p_whatsapp_number),'pending',clock_timestamp())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success',true,'kyc_id',v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_kyc(
  p_kyc_id uuid,
  p_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := (select auth.uid()); v_ok boolean; v_kyc public.kyc_verifications%rowtype;
BEGIN
  SELECT EXISTS(select 1 from public.profiles where id=v_uid and role='admin' and status='active') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'INVALID_KYC_STATUS'; END IF;
  SELECT * INTO v_kyc FROM public.kyc_verifications WHERE id=p_kyc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KYC_NOT_FOUND'; END IF;
  IF v_kyc.status <> 'pending' THEN RAISE EXCEPTION 'KYC_ALREADY_REVIEWED'; END IF;
  UPDATE public.kyc_verifications SET status=p_status,rejection_reason=CASE WHEN p_status='rejected' THEN coalesce(p_rejection_reason,'Documentos inválidos') ELSE NULL END,reviewed_at=clock_timestamp() WHERE id=p_kyc_id;
  IF p_status='approved' THEN
    UPDATE public.profiles SET is_verified=true,verification_status='verified' WHERE id=v_kyc.user_id;
  END IF;
  RETURN jsonb_build_object('success',true,'kyc_id',v_kyc.id,'status',p_status);
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_kyc(text,text,text,text) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_kyc(uuid,text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.submit_kyc(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_kyc(uuid,text,text) TO authenticated;

DROP POLICY IF EXISTS kyc_insert_own ON public.kyc_verifications;
CREATE POLICY kyc_select_own_or_admin ON public.kyc_verifications FOR SELECT TO authenticated
USING ((select auth.uid())=user_id OR EXISTS(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.status='active'));
REVOKE INSERT, UPDATE, DELETE ON public.kyc_verifications FROM authenticated,anon;

DROP POLICY IF EXISTS kyc_private_objects_owner ON storage.objects;
CREATE POLICY kyc_private_objects_owner ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='kyc-private' AND (storage.foldername(name))[1]=(select auth.uid())::text);
CREATE POLICY kyc_private_objects_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='kyc-private' AND (storage.foldername(name))[1]=(select auth.uid())::text);
CREATE POLICY kyc_private_objects_admin ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='kyc-private' AND EXISTS(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.status='active'));

COMMENT ON FUNCTION public.submit_kyc(text,text,text,text) IS 'Stores only private object paths; KYC binary data belongs in private Storage.';
