-- =====================================================
-- Fix daily peak not reset on phase transitions
-- =====================================================
-- The approval code was resetting peak_equity to
-- starting_balance but NOT daily_peak_equity. This
-- caused an immediate daily-drawdown breach when a
-- trader was approved to the next phase on the same
-- day they traded the prior phase.
-- =====================================================

-- 1. Backfill: for active/funded accounts that passed a
--    phase, ensure daily_peak_equity is not higher than
--    starting_balance (the equity was reset on approval).
UPDATE public.trader_accounts
SET daily_peak_equity = starting_balance,
    daily_peak_date   = CURRENT_DATE
WHERE status IN ('active','funded')
  AND (
       (phase1_passed_at IS NOT NULL AND current_phase >= 2)
    OR (phase2_passed_at IS NOT NULL AND status = 'funded')
  )
  AND COALESCE(daily_peak_equity, starting_balance) > starting_balance;

-- 2. Update the enforce_trading_rules trigger to reset
--    daily peak whenever the equity snapshots back to
--    the starting balance (a telltale sign of a phase
--    or payout reset) – defence in depth.
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
  daily_dd_pct numeric;
  current_peak numeric;
  new_daily_peak numeric;
  today_date date;
  equity_reset boolean;
BEGIN
  SELECT * INTO acct FROM public.trader_accounts WHERE id = NEW.trader_account_id;
  IF acct IS NULL OR acct.status NOT IN ('active','funded') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO ch FROM public.challenges WHERE id = acct.challenge_id;
  IF ch IS NULL THEN RETURN NEW; END IF;

  today_date := CURRENT_DATE;

  -- Trailing peak equity: highest the account has ever reached
  current_peak := GREATEST(
    acct.starting_balance,
    COALESCE(acct.peak_equity, acct.starting_balance),
    NEW.equity
  );

  profit_pct := ((NEW.equity - acct.starting_balance)::numeric / acct.starting_balance) * 100;
  dd_pct := ((current_peak - NEW.equity)::numeric / current_peak) * 100;

  -- Detect an equity reset (phase transition / payout reset):
  -- when the incoming snapshot matches the starting balance
  -- and the account's current equity is also at starting balance.
  equity_reset := (NEW.equity = acct.starting_balance)
                  AND (acct.current_equity = acct.starting_balance);

  -- Daily peak tracking (reset per day, or on equity reset)
  IF equity_reset OR acct.daily_peak_date IS DISTINCT FROM today_date THEN
    new_daily_peak := NEW.equity;
    daily_dd_pct := 0;
  ELSE
    new_daily_peak := GREATEST(COALESCE(acct.daily_peak_equity, acct.starting_balance), NEW.equity);
    daily_dd_pct := ((new_daily_peak - NEW.equity)::numeric / new_daily_peak) * 100;
  END IF;

  -- Update account fields
  UPDATE public.trader_accounts
    SET current_equity = NEW.equity,
        peak_equity = current_peak,
        daily_peak_equity = new_daily_peak,
        daily_peak_date = today_date,
        updated_at = now()
    WHERE id = acct.id;

  -- Daily drawdown breach check (if max_daily_drawdown_percent is set)
  IF ch.max_daily_drawdown_percent IS NOT NULL AND daily_dd_pct >= ch.max_daily_drawdown_percent THEN
    UPDATE public.trader_accounts
      SET status = 'breached',
          breach_reason = 'Max daily drawdown ' || round(daily_dd_pct,2) || '% exceeded ' || ch.max_daily_drawdown_percent || '% (daily peak: ' || round(new_daily_peak) || ')'
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, 'Account Breached', 'Daily drawdown limit exceeded. Account closed.', 'error');
    RETURN NEW;
  END IF;

  -- Overall drawdown breach check
  IF dd_pct >= ch.max_drawdown_percent THEN
    UPDATE public.trader_accounts
      SET status = 'breached',
          breach_reason = 'Max trailing drawdown ' || round(dd_pct,2) || '% exceeded ' || ch.max_drawdown_percent || '% (peak: ' || round(current_peak) || ')'
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, 'Account Breached', 'Trailing drawdown limit exceeded. Account closed.', 'error');
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_trading_rules() IS 'Trailing drawdown + daily drawdown enforcement. Also resets daily peak on equity reset (phase transition). Triggered on INSERT into account_snapshots.';
