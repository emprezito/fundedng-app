-- ── LEADERBOARD CACHE ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leaderboard_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES public.trader_accounts(id) ON DELETE CASCADE NOT NULL,
  anonymized_name text NOT NULL,
  avatar_initials text NOT NULL,
  challenge_name text NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  starting_balance numeric NOT NULL,
  monthly_profit numeric NOT NULL DEFAULT 0,
  monthly_profit_percent numeric NOT NULL DEFAULT 0,
  total_return_percent numeric NOT NULL DEFAULT 0,
  total_payouts numeric NOT NULL DEFAULT 0,
  payout_count int NOT NULL DEFAULT 0,
  status text NOT NULL,
  current_phase int NOT NULL DEFAULT 1,
  trading_days int NOT NULL DEFAULT 0,
  last_updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_cache_account
  ON public.leaderboard_cache(account_id);

CREATE INDEX IF NOT EXISTS leaderboard_cache_monthly_profit
  ON public.leaderboard_cache(monthly_profit DESC);

ALTER TABLE public.leaderboard_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read leaderboard" ON public.leaderboard_cache
  FOR SELECT USING (true);

CREATE POLICY "Service role manages leaderboard" ON public.leaderboard_cache
  FOR ALL USING (true) WITH CHECK (true);

-- Add opt-in to profiles if not already there
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false;

-- ── LIVE ACTIVITY FEED ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('payout_paid', 'phase2_approved', 'funded_approved')),
  anonymized_name text NOT NULL,
  avatar_initials text NOT NULL,
  challenge_name text NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  amount numeric,
  account_size numeric,
  created_at timestamptz DEFAULT now()
);

-- Keep only last 100 rows — older events auto-deleted by trigger
CREATE OR REPLACE FUNCTION public.trim_live_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.live_activity
  WHERE id NOT IN (
    SELECT id FROM public.live_activity
    ORDER BY created_at DESC
    LIMIT 100
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trim_live_activity_trigger
  AFTER INSERT ON public.live_activity
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trim_live_activity();

-- RLS: public read
ALTER TABLE public.live_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read live activity" ON public.live_activity
  FOR SELECT USING (true);

CREATE POLICY "Service role manages live activity" ON public.live_activity
  FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime on both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_cache;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_activity;
