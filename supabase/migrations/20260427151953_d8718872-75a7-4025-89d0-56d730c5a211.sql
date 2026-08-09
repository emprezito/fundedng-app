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

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_phase2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_phase2(uuid) TO authenticated;