ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS trading_days INT NOT NULL DEFAULT 0;

-- Backfill trading_days for existing accounts based on snapshot data
UPDATE public.trader_accounts ta
SET trading_days = sub.days
FROM (
  SELECT
    trader_account_id,
    COUNT(DISTINCT snapshot_time::date) AS days
  FROM account_snapshots
  GROUP BY trader_account_id
) sub
WHERE ta.id = sub.trader_account_id
  AND ta.trading_days = 0;
