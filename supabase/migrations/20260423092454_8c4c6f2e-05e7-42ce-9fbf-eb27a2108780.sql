-- =========================================================
-- 1. account_requests queue
-- =========================================================
CREATE TABLE IF NOT EXISTS public.account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE,
  challenge_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | claimed | fulfilled | failed
  claimed_by text,         -- 'worker:<id>' or 'admin:<uuid>'
  claimed_at timestamptz,
  fulfilled_at timestamptz,
  failure_reason text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_requests_status ON public.account_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_account_requests_user ON public.account_requests(user_id);

ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own requests" ON public.account_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage requests" ON public.account_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_account_requests_updated_at
  BEFORE UPDATE ON public.account_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- 2. mt5_worker_events audit log
-- =========================================================
CREATE TABLE IF NOT EXISTS public.mt5_worker_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- claim | fulfill | snapshot | status | error
  worker_id text,
  trader_account_id uuid,
  account_request_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mt5_events_created ON public.mt5_worker_events(created_at DESC);

ALTER TABLE public.mt5_worker_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view worker events" ON public.mt5_worker_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 3. Auto-create account_request when order is paid
-- =========================================================
CREATE OR REPLACE FUNCTION public.queue_account_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    INSERT INTO public.account_requests(user_id, order_id, challenge_id)
    VALUES (NEW.user_id, NEW.id, NEW.challenge_id)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_orders_queue_request ON public.orders;
CREATE TRIGGER tg_orders_queue_request
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_account_request();

-- Backfill existing paid orders that don't yet have a request
INSERT INTO public.account_requests(user_id, order_id, challenge_id)
SELECT o.user_id, o.id, o.challenge_id
FROM public.orders o
WHERE o.status IN ('paid','delivered')
  AND NOT EXISTS (SELECT 1 FROM public.account_requests r WHERE r.order_id = o.id)
ON CONFLICT (order_id) DO NOTHING;

-- Mark already-delivered orders as fulfilled
UPDATE public.account_requests r
SET status = 'fulfilled', fulfilled_at = COALESCE(r.fulfilled_at, now())
FROM public.orders o
WHERE r.order_id = o.id AND o.status = 'delivered' AND r.status <> 'fulfilled';

-- =========================================================
-- 4. Automatic rule enforcement on snapshot insert
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_trading_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acct RECORD;
  ch RECORD;
  profit_pct numeric;
  dd_pct numeric;
BEGIN
  SELECT * INTO acct FROM public.trader_accounts WHERE id = NEW.trader_account_id;
  IF acct IS NULL OR acct.status NOT IN ('active','funded') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO ch FROM public.challenges WHERE id = acct.challenge_id;
  IF ch IS NULL THEN RETURN NEW; END IF;

  profit_pct := ((NEW.equity - acct.starting_balance)::numeric / acct.starting_balance) * 100;
  dd_pct := ((acct.starting_balance - NEW.equity)::numeric / acct.starting_balance) * 100;

  -- Update current equity
  UPDATE public.trader_accounts
    SET current_equity = NEW.equity, updated_at = now()
    WHERE id = acct.id;

  -- Breach check (any phase, including funded)
  IF dd_pct >= ch.max_drawdown_percent THEN
    UPDATE public.trader_accounts
      SET status = 'breached',
          breach_reason = 'Max drawdown ' || round(dd_pct,2) || '% exceeded ' || ch.max_drawdown_percent || '%'
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, 'Account Breached', 'Drawdown limit exceeded. Account closed.', 'error');
    RETURN NEW;
  END IF;

  -- Phase progression (only for non-funded)
  IF acct.status = 'active' AND profit_pct >= ch.profit_target_percent THEN
    IF acct.current_phase = 1 AND ch.phases >= 2 THEN
      UPDATE public.trader_accounts
        SET current_phase = 2, phase1_passed_at = COALESCE(phase1_passed_at, now())
        WHERE id = acct.id;
      INSERT INTO public.notifications(user_id,title,message,type)
        VALUES (acct.user_id, 'Phase 1 Passed', 'Move on to Phase 2. Keep trading.', 'success');
    ELSIF acct.current_phase >= ch.phases THEN
      UPDATE public.trader_accounts
        SET status = 'funded',
            phase2_passed_at = COALESCE(phase2_passed_at, now()),
            funded_at = COALESCE(funded_at, now())
        WHERE id = acct.id;
      -- certificate trigger fires automatically
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_snapshots_enforce_rules ON public.account_snapshots;
CREATE TRIGGER tg_snapshots_enforce_rules
  AFTER INSERT ON public.account_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trading_rules();

-- =========================================================
-- 5. Wire existing certificate triggers (re-attach in case missing)
-- =========================================================
DROP TRIGGER IF EXISTS tg_trader_accounts_funded_cert ON public.trader_accounts;
CREATE TRIGGER tg_trader_accounts_funded_cert
  AFTER INSERT OR UPDATE OF status ON public.trader_accounts
  FOR EACH ROW EXECUTE FUNCTION public.issue_funded_certificate();

DROP TRIGGER IF EXISTS tg_payouts_cert ON public.payouts;
CREATE TRIGGER tg_payouts_cert
  AFTER INSERT OR UPDATE OF status ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.issue_payout_certificate();