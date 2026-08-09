-- Remove 10% Daily Drawdown from Elite 1M challenges
-- The DB trigger (enforce_trading_rules) already skips daily drawdown enforcement
-- when max_daily_drawdown_percent IS NULL, so this alone stops the rule.

UPDATE public.challenges
SET max_daily_drawdown_percent = NULL
WHERE name = 'Elite'
  AND account_size = 1000000
  AND max_daily_drawdown_percent IS NOT NULL;
