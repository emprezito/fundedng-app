-- Add peak_equity column to trader_accounts for trailing drawdown tracking
ALTER TABLE public.trader_accounts
ADD COLUMN peak_equity numeric DEFAULT NULL;

-- Backfill peak_equity from account_snapshots for existing accounts
UPDATE public.trader_accounts ta
SET peak_equity = sub.peak
FROM (
  SELECT trader_account_id, GREATEST(starting_balance, MAX(equity)) AS peak
  FROM public.account_snapshots
  JOIN public.trader_accounts ON trader_accounts.id = account_snapshots.trader_account_id
  GROUP BY trader_account_id, starting_balance
) sub
WHERE ta.id = sub.trader_account_id;

-- For accounts with no snapshots, set peak_equity = starting_balance
UPDATE public.trader_accounts
SET peak_equity = starting_balance
WHERE peak_equity IS NULL;

-- Recreate enforce_trading_rules trigger to use trailing drawdown from peak_equity
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
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Update existing breach_reason messages to clarify they used old calculation (optional metadata)
COMMENT ON FUNCTION public.enforce_trading_rules() IS 'Trailing drawdown enforcement using peak_equity. Triggered on INSERT into account_snapshots.';
