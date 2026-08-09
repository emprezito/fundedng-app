ALTER TABLE public.trader_accounts 
  ADD COLUMN phase_rejected_reason text,
  ADD COLUMN phase_rejected_at timestamptz;
