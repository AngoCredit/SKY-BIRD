-- =============================================================================
-- AUTH HARDENING
-- Prevent users from self-assigning admin through user_metadata and guarantee
-- profile + zero-balance wallet creation after Auth signup.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id,name,email,avatar_url,role,status,is_verified,verification_status,created_at,last_login_at)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''),split_part(COALESCE(NEW.email,''),'@',1),'Piloto'),
    COALESCE(NEW.email,''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url','https://api.dicebear.com/7.x/avataaars/svg?seed='||NEW.id),
    'player',
    'active',false,'unverified',COALESCE(NEW.created_at,now()),now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email=EXCLUDED.email,
    last_login_at=now();

  INSERT INTO public.wallets(user_id,available_balance,locked_balance,currency)
  VALUES(NEW.id,0,0,'USD')
  ON CONFLICT(user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
