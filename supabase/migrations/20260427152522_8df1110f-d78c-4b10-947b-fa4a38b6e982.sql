ALTER TABLE public.trader_accounts ADD COLUMN IF NOT EXISTS funded_requested_at timestamp with time zone;

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

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_funded(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_funded(uuid) TO authenticated;