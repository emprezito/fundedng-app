-- =========================================================
-- Close out account_requests properly
--
-- 1. Backfill: orders that already have a delivered trader_accounts row but
--    are still 'paid' are marked 'delivered' and their matching
--    account_requests are fulfilled. Covers by-hand/manual-SQL deliveries that
--    skipped the normal delivery paths (webhook / reconcile / admin route).
-- 2. Guard trigger: any trader_accounts INSERT that carries an order_id now
--    fulfils the matching account_request, so no future delivery path —
--    webhook, reconcile, manual SQL, partner — can leave a stuck 'pending'.
-- =========================================================

-- 1. Backfill stale orders
UPDATE public.orders o
SET status = 'delivered'
WHERE o.status = 'paid'
  AND EXISTS (SELECT 1 FROM public.trader_accounts a WHERE a.order_id = o.id);

-- 2. Backfill matching account_requests
UPDATE public.account_requests r
SET status = 'fulfilled',
    fulfilled_at = COALESCE(r.fulfilled_at, now())
WHERE r.status <> 'fulfilled'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.trader_accounts a ON a.order_id = o.id
    WHERE o.id = r.order_id
  );

-- 3. Guard trigger: close the request whenever an account is inserted with an
--    order_id. Idempotent with tg_orders_queue_request and the pool/manual
--    delivery upserts (account_requests.order_id is unique).
CREATE OR REPLACE FUNCTION public.close_account_request_on_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    INSERT INTO public.account_requests(order_id, user_id, challenge_id, status, fulfilled_at, claimed_by)
    VALUES (NEW.order_id, NEW.user_id, NEW.challenge_id, 'fulfilled', now(), 'system')
    ON CONFLICT (order_id) DO UPDATE
      SET status = 'fulfilled',
          fulfilled_at = COALESCE(public.account_requests.fulfilled_at, now()),
          claimed_by = 'system';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_trader_accounts_close_request ON public.trader_accounts;
CREATE TRIGGER tg_trader_accounts_close_request
  AFTER INSERT ON public.trader_accounts
  FOR EACH ROW EXECUTE FUNCTION public.close_account_request_on_account();