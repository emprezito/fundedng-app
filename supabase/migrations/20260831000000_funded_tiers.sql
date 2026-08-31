-- Funded Tier system.
--
-- When a trader first becomes Funded they are "Funded 1" (10% max withdrawal per
-- payout). Each time a payout is marked paid, the OLD account is closed and a NEW
-- account is provisioned from the pool at the NEXT tier:
--   Funded 1  -> 10% max withdrawal
--   Funded 2  -> 50% max withdrawal
--   Funded 3  -> 50% max withdrawal
--   Funded 4+ -> 100% max withdrawal
--
-- funded_tier on trader_accounts reflects the tier of the CURRENT live account.
-- The withdrawal cap for a payout is derived from the tier of the account the
-- trader is on when requesting (i.e. how many paid payouts they have had + 1).

ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS funded_tier INT NOT NULL DEFAULT 1;

-- Sub-segment the funded pool (phase = 3) by tier so admins can pre-load
-- specifically "Funded 2", "Funded 3", ... accounts.
ALTER TABLE public.account_pool
  ADD COLUMN IF NOT EXISTS funded_tier INT;

-- For non-funded pool accounts (phase 1/2) funded_tier is not used.
