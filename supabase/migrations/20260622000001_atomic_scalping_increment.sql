-- Atomic scalping-warnings counter.
-- Locks the row so concurrent requests cannot overwrite each other.
-- Returns the new count, or -1 if the account is already breached.
CREATE OR REPLACE FUNCTION public.increment_scalping_warnings(
  p_account_id UUID,
  p_increment INT DEFAULT 1
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_current INT;
  v_status  TEXT;
BEGIN
  SELECT scalping_warnings, status INTO v_current, v_status
  FROM public.trader_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_status = 'breached' THEN
    RETURN -1;
  END IF;

  v_current := COALESCE(v_current, 0) + p_increment;

  UPDATE public.trader_accounts
  SET scalping_warnings = v_current
  WHERE id = p_account_id;

  RETURN v_current;
END;
$$;
