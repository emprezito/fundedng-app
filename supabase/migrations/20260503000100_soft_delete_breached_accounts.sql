-- Add soft-delete support to trader_accounts
-- Breached accounts will be soft-deleted (deleted_at set) instead of hard-deleted
-- This ensures traders can still see their breached accounts and the reason

ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for efficient filtering of non-deleted records
CREATE INDEX IF NOT EXISTS idx_trader_accounts_active
  ON public.trader_accounts (user_id)
  WHERE deleted_at IS NULL;

-- Update the cron job to soft-delete instead of hard-delete
-- First, unschedule the old job
SELECT cron.unschedule('delete-old-breached-accounts');

-- Create the new soft-delete job
SELECT cron.schedule(
  'soft-delete-old-breached-accounts',
  '* * * * *',
  $$
    UPDATE public.trader_accounts
      SET deleted_at = NOW()
    WHERE status = 'breached'
      AND deleted_at IS NULL
      AND updated_at < NOW() - INTERVAL '5 minutes'
  $$
);
