-- Fix social proof RLS to use user_roles directly
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

-- Also ensure the public read policy exists
DROP POLICY IF EXISTS "Public can view visible items"
  ON public.social_proof_items;

CREATE POLICY "Public can view visible items"
  ON public.social_proof_items
  FOR SELECT
  TO anon, authenticated
  USING (is_visible = true);
