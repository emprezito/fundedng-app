-- Notify admins via push when a trader requests phase 2 or funded approval,
-- and when a new payout is requested.

-- 1. Modify request_phase2 to also send push notification to admins
CREATE OR REPLACE FUNCTION public.request_phase2(_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acct RECORD;
BEGIN
  SELECT * INTO acct FROM public.trader_accounts WHERE id = _account_id;
  IF acct IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF acct.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your account';
  END IF;
  IF acct.status <> 'active' OR acct.current_phase <> 1 THEN
    RAISE EXCEPTION 'Account is not in active phase 1';
  END IF;

  UPDATE public.trader_accounts
    SET phase2_requested_at = COALESCE(phase2_requested_at, now())
    WHERE id = _account_id;

  INSERT INTO public.notifications(user_id, title, message, type)
  SELECT p.id, 'Phase 2 Approval Requested',
         (SELECT COALESCE(full_name,'A trader') FROM public.profiles WHERE id = acct.user_id) || ' requested phase 2 approval (login ' || acct.mt5_login || ').',
         'info'
  FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin';

  PERFORM public.notify_push_event(
    'phase2_requested',
    NULL,
    '📋 Phase 2 Request',
    (SELECT COALESCE(full_name,'A trader') FROM public.profiles WHERE id = acct.user_id) || ' requested phase 2 (login ' || acct.mt5_login || ').',
    '/admin',
    true
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_phase2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_phase2(uuid) TO authenticated;

-- 2. Modify request_funded to also send push notification to admins
CREATE OR REPLACE FUNCTION public.request_funded(_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acct RECORD;
BEGIN
  SELECT * INTO acct FROM public.trader_accounts WHERE id = _account_id;
  IF acct IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF acct.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your account';
  END IF;
  IF acct.status <> 'active' OR acct.current_phase <> 2 THEN
    RAISE EXCEPTION 'Account is not in active phase 2';
  END IF;

  UPDATE public.trader_accounts
    SET funded_requested_at = COALESCE(funded_requested_at, now())
    WHERE id = _account_id;

  INSERT INTO public.notifications(user_id, title, message, type)
  SELECT p.id, 'Funded Approval Requested',
         (SELECT COALESCE(full_name,'A trader') FROM public.profiles WHERE id = acct.user_id) || ' requested funded approval (login ' || acct.mt5_login || ').',
         'info'
  FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin';

  PERFORM public.notify_push_event(
    'funded_requested',
    NULL,
    '🏆 Funded Request',
    (SELECT COALESCE(full_name,'A trader') FROM public.profiles WHERE id = acct.user_id) || ' requested funded status (login ' || acct.mt5_login || ').',
    '/admin',
    true
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_funded(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_funded(uuid) TO authenticated;

-- 3. Trigger: new payout request -> push to admins
CREATE OR REPLACE FUNCTION public.tg_payouts_insert_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  trader_name text;
BEGIN
  SELECT COALESCE(full_name, 'A trader') INTO trader_name
  FROM public.profiles WHERE id = NEW.user_id;

  -- Notify admins of new payout request
  PERFORM public.notify_push_event(
    'payout_requested',
    NULL,
    '💰 New Payout Request',
    trader_name || ' requested ₦' || to_char(NEW.amount_naira, 'FM999,999,999') || ' payout.',
    '/admin',
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payouts_insert_push ON public.payouts;
CREATE TRIGGER payouts_insert_push
AFTER INSERT ON public.payouts
FOR EACH ROW
EXECUTE FUNCTION public.tg_payouts_insert_push();
