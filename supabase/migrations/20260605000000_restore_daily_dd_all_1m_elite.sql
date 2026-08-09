-- =====================================================
-- Restore 10% Daily DD for all Elite 1M challenges
-- =====================================================
-- Reactivates any deactivated Elite 1M challenges and
-- ensures 10% daily drawdown is set. Deactivates any
-- duplicate challenges created without daily DD.

-- 1. Reactivate original Elite 1M challenges and restore 10% DD
UPDATE public.challenges
SET is_active = true, max_daily_drawdown_percent = 10.00
WHERE account_size = 1000000
  AND name = 'Elite'
  AND is_active = false;

-- 2. Deactivate any duplicate Elite 1M challenges (without daily DD)
UPDATE public.challenges
SET is_active = false
WHERE account_size = 1000000
  AND name = 'Elite'
  AND max_daily_drawdown_percent IS NULL
  AND is_active = true;
