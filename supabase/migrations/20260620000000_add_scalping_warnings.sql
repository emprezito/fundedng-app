ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS scalping_warnings INT NOT NULL DEFAULT 0;

-- Backfill existing scalping-warned accounts (none expected, but safe to init)
UPDATE public.trader_accounts
SET scalping_warnings = 0
WHERE scalping_warnings IS NULL;
