-- Backfill trading_days for existing accounts based on their current phase.
-- Phase 1:   count distinct snapshot dates since account creation
-- Phase 2:   count distinct snapshot dates since phase1_passed_at
-- Funded:    count distinct snapshot dates since phase2_passed_at / funded_at
-- Breached:  leave as-is (no longer relevant)

UPDATE public.trader_accounts ta
SET trading_days = COALESCE(sub.days, 0)
FROM (
  SELECT
    ta.id AS trader_account_id,
    COUNT(DISTINCT s.snapshot_time::date) AS days
  FROM public.trader_accounts ta
  LEFT JOIN public.account_snapshots s ON s.trader_account_id = ta.id
    AND s.snapshot_time >= COALESCE(
      -- Phase 2 → start from phase1_passed_at
      CASE WHEN ta.current_phase >= 2 OR ta.status = 'funded' THEN ta.phase1_passed_at END,
      -- Funded fallback
      CASE WHEN ta.status = 'funded' THEN ta.phase2_passed_at END,
      -- Everyone else → account creation
      ta.created_at
    )
  WHERE ta.deleted_at IS NULL
    AND ta.status != 'breached'
  GROUP BY ta.id
) sub
WHERE ta.id = sub.trader_account_id
  AND ta.trading_days != sub.days;
