ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS monitor_paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS monitor_paused_at TIMESTAMPTZ;

ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS monitor_paused_reason TEXT;
