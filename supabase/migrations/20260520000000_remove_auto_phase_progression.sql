-- Remove automatic phase progression from enforce_trading_rules()
-- Phase advancement now requires manual admin approval via the admin panel.
-- The trigger still enforces drawdown limits (breach check).

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
  current_peak numeric;
BEGIN
  SELECT * INTO acct FROM public.trader_accounts WHERE id = NEW.trader_account_id;
  IF acct IS NULL OR acct.status NOT IN ('active','funded') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO ch FROM public.challenges WHERE id = acct.challenge_id;
  IF ch IS NULL THEN RETURN NEW; END IF;

  -- Trailing peak equity: highest the account has ever reached
  current_peak := GREATEST(
    acct.starting_balance,
    COALESCE(acct.peak_equity, acct.starting_balance),
    NEW.equity
  );

  profit_pct := ((NEW.equity - acct.starting_balance)::numeric / acct.starting_balance) * 100;
  -- Trailing drawdown calculated from peak equity (not starting balance)
  dd_pct := ((current_peak - NEW.equity)::numeric / current_peak) * 100;

  -- Update current equity and peak_equity
  UPDATE public.trader_accounts
    SET current_equity = NEW.equity,
        peak_equity = current_peak,
        updated_at = now()
    WHERE id = acct.id;

  -- Breach check (trailing drawdown from peak)
  IF dd_pct >= ch.max_drawdown_percent THEN
    UPDATE public.trader_accounts
      SET status = 'breached',
          breach_reason = 'Max trailing drawdown ' || round(dd_pct,2) || '% exceeded ' || ch.max_drawdown_percent || '% (peak: ' || round(current_peak) || ')'
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, 'Account Breached', 'Trailing drawdown limit exceeded. Account closed.', 'error');
    RETURN NEW;
  END IF;

  -- NOTE: Phase progression is intentionally removed from this function.
  -- Admins must manually approve phase advancement via the admin panel.
  -- This ensures traders don't auto-advance when equity is updated.

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_trading_rules() IS 'Trailing drawdown enforcement only (no auto phase progression). Triggered on INSERT into account_snapshots.';
