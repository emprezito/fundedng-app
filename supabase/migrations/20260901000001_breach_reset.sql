-- Breach Reset system.
--
-- When a trader breaches on Phase 2 or Funded, they may reset (once) instead of
-- buying a fresh challenge. The reset provisions a brand-new MT5 account of the
-- exact same size/currency (and funded tier for funded accounts) from the pool,
-- and charges a fraction of the challenge price via the normal Squad checkout.
--
--   Phase 2 breach -> pay 30% of challenge price -> new Phase 2 account
--   Funded breach  -> pay 60% of account size   -> new Funded account (same tier)
--   Phase 1 breach -> no reset; buy a fresh challenge
--
-- orders.reset_account_id marks a paid order as a reset and records which
-- breached account it replaces.
-- trader_accounts.reset_used enforces the one-reset-per-account rule.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reset_account_id UUID REFERENCES public.trader_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS reset_used BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast lookup of reset orders by account.
CREATE INDEX IF NOT EXISTS orders_reset_account_id_idx
  ON public.orders(reset_account_id)
  WHERE reset_account_id IS NOT NULL;
