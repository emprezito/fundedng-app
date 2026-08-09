-- =====================================================
-- New Elite 1M challenge without daily drawdown
-- =====================================================
-- The old Elite 1M challenge is deactivated so new buyers
-- won't see it. Existing accounts keep referencing the old
-- challenge which gets max_daily_drawdown_percent restored
-- (in case it was wiped by a prior admin edit). A new
-- challenge without max_daily_drawdown_percent is created
-- for all new purchases.

-- 1. Restore 10% daily DD on the old challenge for existing traders
UPDATE public.challenges
SET max_daily_drawdown_percent = 10.00
WHERE account_size = 1000000
  AND name = 'Elite'
  AND max_daily_drawdown_percent IS NULL;

-- 2. Deactivate the old Elite 1M challenge
UPDATE public.challenges
SET is_active = false
WHERE account_size = 1000000
  AND name = 'Elite'
  AND is_active = true;

-- 3. Create a new Elite 1M challenge without daily DD
INSERT INTO public.challenges
  (name, account_size, price_naira, profit_target_percent, max_drawdown_percent,
   min_trading_days, phases, is_active, challenge_type, max_trading_days, discount_percent)
SELECT 'Elite', 1000000, price_naira, profit_target_percent, max_drawdown_percent,
       3, phases, true, 'standard', max_trading_days, 0
FROM public.challenges
WHERE account_size = 1000000
  AND name = 'Elite'
  AND is_active = false
LIMIT 1;
