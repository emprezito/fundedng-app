CREATE TABLE public.daily_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posts jsonb NOT NULL,
  stats jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read daily content"
  ON public.daily_content
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "System can insert daily content"
  ON public.daily_content
  FOR INSERT
  WITH CHECK (true);
