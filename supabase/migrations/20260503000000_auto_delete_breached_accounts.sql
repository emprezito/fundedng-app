-- Auto-delete breached accounts after 5 minutes
-- This creates a pg_cron job that runs every minute to delete accounts
-- that have been breached for more than 5 minutes

-- Create the cron job (requires pg_cron extension)
SELECT cron.schedule(
  'delete-old-breached-accounts',
  '* * * * *',
  $$
    DELETE FROM public.trader_accounts
    WHERE status = 'breached'
      AND updated_at < NOW() - INTERVAL '5 minutes'
  $$
);
