-- Partner application form entries
CREATE TABLE IF NOT EXISTS public.partner_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Step 1: Personal Info
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  country text NOT NULL,

  -- Step 2: Online Presence
  primary_platform text NOT NULL,
  profile_link text NOT NULL,
  follower_count text NOT NULL,
  community_type text NOT NULL,
  community_size text,
  community_link text,

  -- Step 3: Trading Background
  actively_trades text NOT NULL,
  trading_style text NOT NULL,
  passed_challenge text NOT NULL,
  challenge_platform text,
  willing_to_pass_publicly text NOT NULL,

  -- Step 4: Brand Fit
  why_funded_ng text NOT NULL,
  content_type text NOT NULL,
  other_prop_firms text NOT NULL,
  sample_content_link text,

  -- Step 5: Commitments
  agree_no_giveaway_only boolean NOT NULL DEFAULT false,
  agree_public_challenge boolean NOT NULL DEFAULT false,
  agree_no_dm boolean NOT NULL DEFAULT false,
  agree_terms boolean NOT NULL DEFAULT false,

  -- Status tracking
  status text DEFAULT 'pending' NOT NULL
);

-- RLS: anyone can insert (public form), only admins can read
ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit partner applications" ON public.partner_applications;
CREATE POLICY "Anyone can submit partner applications"
  ON public.partner_applications
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins read partner applications" ON public.partner_applications;
CREATE POLICY "Admins read partner applications"
  ON public.partner_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_partner_applications_created_at ON public.partner_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON public.partner_applications (status);
