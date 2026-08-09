-- Add challenge type and instant-funding rule fields to challenges
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS challenge_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS max_daily_drawdown_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS max_trading_days integer;

-- Constrain to known types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'challenges_challenge_type_check'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_challenge_type_check
      CHECK (challenge_type IN ('standard','instant'));
  END IF;
END$$;

-- Seed three Instant Funding tiers (1-step, 1 phase) if not already present
INSERT INTO public.challenges
  (name, account_size, price_naira, profit_target_percent, max_drawdown_percent,
   min_trading_days, phases, is_active, challenge_type,
   max_daily_drawdown_percent, max_trading_days)
SELECT v.name, v.size, v.price, 15, 20, 5, 1, true, 'instant', 10, 45
FROM (VALUES
  ('Instant 1.5M', 1500000::bigint, 120000::bigint),
  ('Instant 2M',   2000000::bigint, 155000::bigint),
  ('Instant 3M',   3000000::bigint, 225000::bigint)
) AS v(name, size, price)
WHERE NOT EXISTS (
  SELECT 1 FROM public.challenges c
  WHERE c.challenge_type = 'instant' AND c.account_size = v.size
);