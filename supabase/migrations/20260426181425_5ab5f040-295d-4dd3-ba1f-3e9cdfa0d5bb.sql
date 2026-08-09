
-- Attach trading rules trigger so equity snapshots automatically enforce
-- breach detection and phase progression.
DROP TRIGGER IF EXISTS account_snapshots_enforce_rules ON public.account_snapshots;
CREATE TRIGGER account_snapshots_enforce_rules
AFTER INSERT ON public.account_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.enforce_trading_rules();

-- Push notifications when trader account status / phase changes
DROP TRIGGER IF EXISTS trader_accounts_push ON public.trader_accounts;
CREATE TRIGGER trader_accounts_push
AFTER UPDATE ON public.trader_accounts
FOR EACH ROW
EXECUTE FUNCTION public.tg_trader_accounts_push();

-- Push notifications on payout status changes
DROP TRIGGER IF EXISTS payouts_push ON public.payouts;
CREATE TRIGGER payouts_push
AFTER UPDATE ON public.payouts
FOR EACH ROW
EXECUTE FUNCTION public.tg_payouts_push();

-- Auto-issue funded certificate when account becomes funded
DROP TRIGGER IF EXISTS trader_accounts_issue_funded_cert ON public.trader_accounts;
CREATE TRIGGER trader_accounts_issue_funded_cert
AFTER INSERT OR UPDATE OF status ON public.trader_accounts
FOR EACH ROW
EXECUTE FUNCTION public.issue_funded_certificate();

-- Auto-issue payout certificate when payout is paid
DROP TRIGGER IF EXISTS payouts_issue_cert ON public.payouts;
CREATE TRIGGER payouts_issue_cert
AFTER INSERT OR UPDATE OF status ON public.payouts
FOR EACH ROW
EXECUTE FUNCTION public.issue_payout_certificate();

-- Queue account_request when an order becomes paid
DROP TRIGGER IF EXISTS orders_queue_request ON public.orders;
CREATE TRIGGER orders_queue_request
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.queue_account_request();

-- updated_at maintenance
DROP TRIGGER IF EXISTS trader_accounts_set_updated_at ON public.trader_accounts;
CREATE TRIGGER trader_accounts_set_updated_at
BEFORE UPDATE ON public.trader_accounts
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS account_requests_set_updated_at ON public.account_requests;
CREATE TRIGGER account_requests_set_updated_at
BEFORE UPDATE ON public.account_requests
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

-- Allow admins to insert account_snapshots (manual equity entry)
-- (Existing policy already allows admins; this is a no-op safety create-if-not-exists.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_snapshots'
      AND policyname = 'Admins insert snapshots'
  ) THEN
    CREATE POLICY "Admins insert snapshots"
      ON public.account_snapshots
      FOR INSERT
      TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END$$;
