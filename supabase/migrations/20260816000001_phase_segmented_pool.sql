-- Add phase column to account_pool for phase-segmented provisioning
-- phase 1 = Phase 1 pool (new purchases)
-- phase 2 = Phase 2 pool (traders passing Phase 1)
-- phase 3 = Funded pool (traders passing Phase 2 + Instant Funding)
ALTER TABLE public.account_pool
  ADD COLUMN IF NOT EXISTS phase INT NOT NULL DEFAULT 1
  CHECK (phase IN (1, 2, 3));

-- Update the partial index to include phase for efficient lookups
DROP INDEX IF EXISTS idx_account_pool_available;
CREATE INDEX idx_account_pool_available
  ON public.account_pool (currency, phase, account_size_ngn, account_size_usd)
  WHERE status = 'available';

-- Default existing available accounts to phase 1 (most common use case)
UPDATE public.account_pool SET phase = 1 WHERE status = 'available';
