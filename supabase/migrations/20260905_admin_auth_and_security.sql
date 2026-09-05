-- SKY-BIRD — admin/auth security hardening
-- Never authenticate admins with browser-local passwords or role switching.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE(id uuid, name text, email text, role text, status text, is_verified boolean, verification_status text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  SELECT p.id,p.name,p.email,p.role,p.status,p.is_verified,p.verification_status
  FROM public.profiles p WHERE p.id=(select auth.uid()) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_status(p_user_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := (select auth.uid()); v_ok boolean; v_old text;
BEGIN
  SELECT EXISTS(select 1 from public.profiles where id=v_uid and role='admin' and status='active') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'INVALID_USER_STATUS'; END IF;
  SELECT status INTO v_old FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  UPDATE public.profiles SET status=p_status WHERE id=p_user_id;
  RETURN jsonb_build_object('success',true,'user_id',p_user_id,'old_status',v_old,'status',p_status);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid,p_reason text DEFAULT 'Admin request')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := (select auth.uid()); v_ok boolean;
BEGIN
  SELECT EXISTS(select 1 from public.profiles where id=v_uid and role='admin' and status='active') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_user_id=v_uid THEN RAISE EXCEPTION 'SELF_DELETE_FORBIDDEN'; END IF;
  IF NOT EXISTS(select 1 from public.profiles where id=p_user_id) THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  UPDATE public.profiles SET status='suspended' WHERE id=p_user_id;
  INSERT INTO public.audit_logs(admin_id,admin_email,action,target,before_value,after_value,timestamp)
  SELECT v_uid,p.email,'ADMIN_DELETE_USER',p.id::text,'active','suspended: '||coalesce(p_reason,'Admin request'),clock_timestamp()
  FROM public.profiles p WHERE p.id=p_user_id;
  RETURN jsonb_build_object('success',true,'user_id',p_user_id,'status','suspended');
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_user_status(uuid,text) FROM public,anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid,text) TO authenticated;

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
USING ((select auth.uid())=id)
WITH CHECK ((select auth.uid())=id AND role='player' AND status='active');

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE TO authenticated
USING (EXISTS(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.status='active'))
WITH CHECK (EXISTS(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.status='active'));

COMMENT ON FUNCTION public.get_my_profile() IS 'Authenticated profile lookup; role comes only from persisted server profile.';
