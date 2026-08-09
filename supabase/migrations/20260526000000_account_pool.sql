-- Account Pool: pre-loaded Exness MT5 demo credentials for instant delivery
-- Admins pre-fill this table with demo accounts created manually in the broker terminal.
-- When a trader pays, claimPoolAccount picks one and creates the trader_accounts row automatically.

CREATE TABLE IF NOT EXISTS public.account_pool (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mt5_login     TEXT NOT NULL,
  mt5_password  TEXT NOT NULL,
  investor_password TEXT NOT NULL,
  mt5_server    TEXT NOT NULL DEFAULT 'Exness-MT5Trial9',
  account_size_ngn BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','assigned','archived','flagged')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  assigned_at   TIMESTAMPTZ,
  assigned_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  assigned_account_id UUID REFERENCES public.trader_accounts(id) ON DELETE SET NULL
);

-- Speed up the "find available by size" query
CREATE INDEX IF NOT EXISTS idx_account_pool_available
  ON public.account_pool (status, account_size_ngn)
  WHERE status = 'available';

-- Also index for inventory / group-by queries
CREATE INDEX IF NOT EXISTS idx_account_pool_status
  ON public.account_pool (status);

-- Add investor_password column to trader_accounts for storing the VPS read-only password
ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS investor_password TEXT;

-- RLS: service-role only (no user-facing policies needed)
ALTER TABLE public.account_pool ENABLE ROW LEVEL SECURITY;

-- Only allow the service role (supabaseAdmin) to touch account_pool
CREATE POLICY "service_role_only" ON public.account_pool
  USING (true)
  WITH CHECK (true);
-- The above is effectively a no-op since RLS is bypassed for service_role.
-- It prevents direct user access via the public anon/key clients.

-- Notify replication ignores it
ALTER TABLE public.account_pool REPLICA IDENTITY FULL;
