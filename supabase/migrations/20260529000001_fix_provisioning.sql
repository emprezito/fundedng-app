-- Function to find and fix orders that are paid but have no account
CREATE OR REPLACE FUNCTION public.find_unprovisioned_orders()
RETURNS TABLE(
  order_id uuid,
  user_id uuid,
  challenge_id uuid,
  amount_paid bigint,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.user_id, o.challenge_id, o.amount_paid, o.created_at
  FROM orders o
  WHERE o.status = 'paid'
    AND NOT EXISTS (
      SELECT 1 FROM trader_accounts ta WHERE ta.order_id = o.id
    )
  ORDER BY o.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.find_unprovisioned_orders()
TO authenticated;

-- Ensure account_requests has a unique constraint on order_id for upsert
-- (needed for the pool upsert fix)
ALTER TABLE public.account_requests
DROP CONSTRAINT IF EXISTS account_requests_order_id_key;
ALTER TABLE public.account_requests
ADD CONSTRAINT account_requests_order_id_key UNIQUE (order_id);
