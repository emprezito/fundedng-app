-- Cleanup: remove duplicate trader_accounts rows created by the backfill migration's
-- unguarded challenge JOIN. Keeps only the oldest row per (user_id, mt5_login, mt5_server).

DELETE FROM public.trader_accounts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, mt5_login, mt5_server
        ORDER BY created_at ASC
      ) AS rn
    FROM public.trader_accounts
    WHERE provider = 'exness-bot'
      AND order_id IS NULL
  ) dupes
  WHERE dupes.rn > 1
);
