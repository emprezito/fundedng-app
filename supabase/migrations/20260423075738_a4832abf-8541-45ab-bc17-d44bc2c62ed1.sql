-- Make bucket private (we'll use signed URLs or direct authed reads)
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

DROP POLICY IF EXISTS "Public read chat attachments" ON storage.objects;

CREATE POLICY "Authenticated read chat attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-attachments');