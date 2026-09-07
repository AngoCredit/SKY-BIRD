-- SKY-BIRD — canonical private KYC storage
-- Keep both historical bucket IDs private for backwards compatibility.

INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-private','kyc-private',false)
ON CONFLICT (id) DO UPDATE SET public=false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents','kyc-documents',false)
ON CONFLICT (id) DO UPDATE SET public=false;

DROP POLICY IF EXISTS kyc_documents_owner_select ON storage.objects;
DROP POLICY IF EXISTS kyc_documents_owner_insert ON storage.objects;
DROP POLICY IF EXISTS kyc_documents_admin_select ON storage.objects;
DROP POLICY IF EXISTS kyc_private_owner_select ON storage.objects;
DROP POLICY IF EXISTS kyc_private_owner_insert ON storage.objects;
DROP POLICY IF EXISTS kyc_private_admin_select ON storage.objects;

CREATE POLICY kyc_documents_owner_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id IN ('kyc-private','kyc-documents')
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY kyc_documents_owner_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('kyc-private','kyc-documents')
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY kyc_documents_admin_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id IN ('kyc-private','kyc-documents')
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=(select auth.uid())
      AND p.role='admin'
      AND p.status='active'
  )
);

REVOKE UPDATE, DELETE ON storage.objects FROM authenticated, anon;
