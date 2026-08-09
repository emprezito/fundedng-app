-- Remove auto soft-delete of breached accounts
-- Traders should see their breached accounts as "archived" on their dashboard
-- instead of them being soft-deleted after 5 minutes

-- Safely unschedule cron jobs (may already have been removed by prior migrations)
DO $$ BEGIN PERFORM cron.unschedule('soft-delete-old-breached-accounts'); EXCEPTION WHEN OTHERS THEN END; $$;
DO $$ BEGIN PERFORM cron.unschedule('delete-old-breached-accounts'); EXCEPTION WHEN OTHERS THEN END; $$;

-- Drop the index that filters on deleted_at
DROP INDEX IF EXISTS idx_trader_accounts_active;

-- Drop the policy that references deleted_at, then drop the column
-- Traders can no longer delete breached accounts (they stay visible as archived)
DROP POLICY IF EXISTS "Traders delete own breached accounts" ON public.trader_accounts;

ALTER TABLE public.trader_accounts DROP COLUMN IF EXISTS deleted_at;
