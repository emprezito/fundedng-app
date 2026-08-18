-- Revert accounts incorrectly breached by the server-side position stacking check.
-- Only the "(server-side)" check retroactively breached accounts for historical violations.
-- EA-based breaches (handle-positions-violation.ts) are legitimate and should NOT be reverted.

-- Step 1: Preview what will be affected
-- Uncomment to inspect before running the UPDATE:
-- SELECT id, user_id, status, breach_reason, mt5_login
-- FROM public.trader_accounts
-- WHERE status = 'breached'
--   AND breach_reason LIKE '%(server-side)%';

-- Step 2: Revert only server-side position stacking breaches back to active
UPDATE public.trader_accounts
SET status = 'active',
    breach_reason = NULL
WHERE status = 'breached'
  AND breach_reason LIKE '%(server-side)%';
