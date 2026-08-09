-- Fix social proof RLS policies to use direct user_roles lookup instead of has_role() function
-- This covers both the table and storage bucket policies

-- ========== TABLE POLICIES ==========

DROP POLICY IF EXISTS "Admins manage all items"
  ON public.social_proof_items;

CREATE POLICY "Admins manage all items"
  ON public.social_proof_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Public can view visible items"
  ON public.social_proof_items;

CREATE POLICY "Public can view visible items"
  ON public.social_proof_items
  FOR SELECT
  TO anon, authenticated
  USING (is_visible = true);

-- ========== STORAGE POLICIES ==========

DROP POLICY IF EXISTS "Admins can upload social proof images"
  ON storage.objects;

CREATE POLICY "Admins can upload social proof images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'social-proof'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete social proof images"
  ON storage.objects;

CREATE POLICY "Admins can delete social proof images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'social-proof'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Public can view social proof images"
  ON storage.objects;

CREATE POLICY "Public can view social proof images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'social-proof');
