-- ============================================================
-- Add KYC document upload support (for USD / non-bank KYC)
-- ============================================================
-- Allows users to upload identity documents for manual admin
-- KYC verification, as an alternative to Paystack bank verification.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_document_url TEXT,
  ADD COLUMN IF NOT EXISTS kyc_document_type TEXT;

-- Create storage bucket for KYC documents (private, max 5MB, images + PDF)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kyc-documents', 'kyc-documents', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload KYC docs (path must start with their user id)
CREATE POLICY "Users upload own KYC documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND SPLIT_PART(name, '/', 1) = auth.uid()::text
  );

-- Allow users to view their own KYC documents
CREATE POLICY "Users view own KYC documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND SPLIT_PART(name, '/', 1) = auth.uid()::text
  );

-- Allow admins to view any KYC document
CREATE POLICY "Admins view all KYC documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND public.has_role(auth.uid(), 'admin')
  );
