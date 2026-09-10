-- Reset campaigns: a database-editable time window during which the standing
-- breach-reset restrictions on the profile Reset page are suspended for
-- traders. Extends the existing paid breach-reset system in
-- src/lib/breach-reset.server.ts (no parallel mechanism).
--
-- Standing rules (enforced whenever NO campaign is active):
--   - account must be provisioned on/after 2026-09-01 (RESET_ELIGIBLE_FROM)
--   - account must not already have used its lifetime reset (reset_used)
-- During an ACTIVE campaign both checks are skipped at reset-request time.
--
-- A campaign is "active" when now() is between start_at and end_at. There may
-- be zero or one active campaign at any time — code must query for *any* row
-- where now() is in range, never assume a single row exists.

-- 1. breached_at — record-keeping timestamp for when an account was breached.
--    Does NOT gate reset eligibility in this design; every breach code path
--    sets it alongside status='breached'.
ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS breached_at TIMESTAMPTZ;

-- 2. reset_campaigns table
CREATE TABLE IF NOT EXISTS public.reset_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for the "active campaign" lookup (now() between start_at and end_at).
CREATE INDEX IF NOT EXISTS reset_campaigns_active_idx
  ON public.reset_campaigns(start_at, end_at);

-- RLS — same pattern as the `challenges` table: public read (the profile page
-- shows a countdown when a campaign is active), admin-only write.
ALTER TABLE public.reset_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reset campaigns" ON public.reset_campaigns
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage reset campaigns" ON public.reset_campaigns
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));