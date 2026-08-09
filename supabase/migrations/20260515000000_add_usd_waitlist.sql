-- Create usd_waitlist table for USD account waitlist signups
-- Allows potential USD customers to join waitlist when USD accounts are not yet available

CREATE TABLE IF NOT EXISTS public.usd_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  account_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.usd_waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including unauthenticated users) to insert into the waitlist
CREATE POLICY "Anyone can insert into usd_waitlist" ON public.usd_waitlist
  FOR INSERT WITH CHECK (true);

-- Only admins can view waitlist entries
CREATE POLICY "Admins can view usd_waitlist" ON public.usd_waitlist
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.usd_waitlist IS 'Waitlist signups for USD-denominated challenges';
COMMENT ON COLUMN public.usd_waitlist.email IS 'Email address of the interested user';
COMMENT ON COLUMN public.usd_waitlist.account_size IS 'The USD account size they were interested in';
