-- Create storage bucket for social proof images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('social-proof', 'social-proof', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: allow authenticated admins to INSERT/DELETE objects
CREATE POLICY "Admins can upload social proof images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'social-proof'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete social proof images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'social-proof'
    AND public.has_role(auth.uid(), 'admin')
  );

-- Public can view social proof images (bucket is public, but explicit policy is good practice)
CREATE POLICY "Public can view social proof images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'social-proof');

CREATE TABLE public.social_proof_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  category TEXT NOT NULL DEFAULT 'payout',
  display_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.social_proof_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view visible items"
  ON public.social_proof_items
  FOR SELECT
  TO anon, authenticated
  USING (is_visible = true);

CREATE POLICY "Admins manage all items"
  ON public.social_proof_items
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
