-- KYC storage compatibility: frontend currently uploads to kyc-documents.
-- Keep it PRIVATE and enforce per-user folder isolation.

INSERT INTO storage.buckets (id,name,public)
VALUES ('kyc-documents','kyc-documents',false)
ON CONFLICT (id) DO UPDATE SET public=false;

DROP POLICY IF EXISTS kyc_documents_insert_own ON storage.objects;
CREATE POLICY kyc_documents_insert_own ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='kyc-documents'
  AND (storage.foldername(name))[1]=(select auth.uid())::text
);

DROP POLICY IF EXISTS kyc_documents_select_own_or_admin ON storage.objects;
CREATE POLICY kyc_documents_select_own_or_admin ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='kyc-documents'
  AND (
    (storage.foldername(name))[1]=(select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id=(select auth.uid()) AND p.role='admin' AND p.status='active'
    )
  )
);

REVOKE ALL ON storage.objects FROM anon;
