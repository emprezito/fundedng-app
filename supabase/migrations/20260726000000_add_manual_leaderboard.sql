-- ── MANUAL LEADERBOARD ────────────────────────────────────────────────────────
-- Admin-curated leaderboard entries (traders not in the auto leaderboard_cache)

CREATE TABLE IF NOT EXISTS public.manual_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_name text NOT NULL,
  avatar_initials text NOT NULL,
  challenge_name text NOT NULL DEFAULT 'Standard',
  account_size numeric NOT NULL DEFAULT 0,
  profit_percent numeric NOT NULL DEFAULT 0,
  profit_amount numeric NOT NULL DEFAULT 0,
  total_profit numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.manual_leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read manual leaderboard" ON public.manual_leaderboard
  FOR SELECT USING (true);

CREATE POLICY "Service role manages manual leaderboard" ON public.manual_leaderboard
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_leaderboard;
