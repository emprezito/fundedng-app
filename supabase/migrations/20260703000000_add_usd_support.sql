-- Add currency support to challenges
ALTER TABLE public.challenges 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN';

ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS usd_price NUMERIC DEFAULT NULL;

-- Add currency to trader accounts
ALTER TABLE public.trader_accounts
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN';

-- Add USD payout tracking
ALTER TABLE public.payouts
ADD COLUMN IF NOT EXISTS last_payout_date TIMESTAMPTZ DEFAULT NULL;

-- Add currency to orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN';

-- App config for exchange rate cache
INSERT INTO public.app_config (key, value)
VALUES 
  ('usd_exchange_rate', '1550'),
  ('usd_rate_updated_at', NOW()::text)
ON CONFLICT (key) DO NOTHING;

-- USD challenge rules config
INSERT INTO public.app_config (key, value)
VALUES
  ('usd_news_restriction_mins', '5'),
  ('usd_inactivity_days', '15'),
  ('usd_min_profitable_days', '5'),
  ('usd_profitable_day_threshold', '0.005'),
  ('usd_payout_cooldown_days', '10')
ON CONFLICT (key) DO NOTHING;
