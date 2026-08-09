-- =====================================================
-- Daily Drawdown (10%) for 1M Elite Accounts
-- =====================================================
-- Adds daily peak tracking to trader_accounts and updates
-- the enforce_trading_rules trigger to also check daily
-- drawdown for accounts with max_daily_drawdown_percent set.
-- =====================================================

-- 1. Add daily peak tracking columns
ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS daily_peak_equity numeric(15,2),
  ADD COLUMN IF NOT EXISTS daily_peak_date date;

-- 2. Backfill daily peak for existing accounts
UPDATE public.trader_accounts
SET daily_peak_equity = COALESCE(peak_equity, starting_balance),
    daily_peak_date = CURRENT_DATE
WHERE daily_peak_equity IS NULL;

-- 3. Set 10% daily drawdown for Elite (1M) challenges
UPDATE public.challenges
SET max_daily_drawdown_percent = 10.00
WHERE account_size = 1000000
  AND max_daily_drawdown_percent IS NULL;

-- 4. Update enforce_trading_rules to also check daily drawdown
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

  -- Daily peak tracking (reset per day)
  IF acct.daily_peak_date IS DISTINCT FROM today_date THEN
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

COMMENT ON FUNCTION public.enforce_trading_rules() IS 'Trailing drawdown + daily drawdown enforcement. Triggered on INSERT into account_snapshots.';
