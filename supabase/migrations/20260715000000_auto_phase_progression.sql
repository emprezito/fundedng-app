-- Add phase_progression_pending column to trader_accounts
-- Values: 'phase2' | 'funded' | null
ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS phase_progression_pending TEXT DEFAULT NULL;

-- Replace enforce_trading_rules() to set phase_progression_pending
-- instead of modifying the same account on phase completion.
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

  IF ch.drawdown_type = 'static_balance' THEN
    -- Static drawdown based on closed balance (USD accounts)
    dd_pct := ((acct.starting_balance - NEW.balance)::numeric / GREATEST(acct.starting_balance, 1)) * 100;
    current_peak := acct.starting_balance;

    profit_pct := ((NEW.balance - acct.starting_balance)::numeric / acct.starting_balance) * 100;

    equity_reset := (NEW.balance = acct.starting_balance)
                    AND (acct.current_equity = acct.starting_balance);

    IF equity_reset OR acct.daily_peak_date IS DISTINCT FROM today_date THEN
      new_daily_peak := NEW.balance;
      daily_dd_pct := 0;
    ELSE
      new_daily_peak := GREATEST(COALESCE(acct.daily_peak_equity, acct.starting_balance), NEW.balance);
      daily_dd_pct := ((new_daily_peak - NEW.balance)::numeric / new_daily_peak) * 100;
    END IF;
  ELSE
    -- Trailing drawdown based on equity (NGN standard accounts)
    current_peak := GREATEST(
      acct.starting_balance,
      COALESCE(acct.peak_equity, acct.starting_balance),
      NEW.equity
    );

    profit_pct := ((NEW.equity - acct.starting_balance)::numeric / acct.starting_balance) * 100;
    dd_pct := ((current_peak - NEW.equity)::numeric / current_peak) * 100;

    equity_reset := (NEW.equity = acct.starting_balance)
                    AND (acct.current_equity = acct.starting_balance);

    IF equity_reset OR acct.daily_peak_date IS DISTINCT FROM today_date THEN
      new_daily_peak := NEW.equity;
      daily_dd_pct := 0;
    ELSE
      new_daily_peak := GREATEST(COALESCE(acct.daily_peak_equity, acct.starting_balance), NEW.equity);
      daily_dd_pct := ((new_daily_peak - NEW.equity)::numeric / new_daily_peak) * 100;
    END IF;
  END IF;

  -- Update account fields
  UPDATE public.trader_accounts
    SET current_equity = NEW.equity,
        peak_equity = current_peak,
        daily_peak_equity = new_daily_peak,
        daily_peak_date = today_date,
        updated_at = now()
    WHERE id = acct.id;

  -- Daily drawdown breach check
  IF ch.max_daily_drawdown_percent IS NOT NULL AND daily_dd_pct >= ch.max_daily_drawdown_percent THEN
    UPDATE public.trader_accounts
      SET status = 'breached',
          breach_reason = 'Max daily drawdown ' || round(daily_dd_pct,2) || '% exceeded ' || ch.max_daily_drawdown_percent || '% (daily peak: ' || round(new_daily_peak) || ')'
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, 'Account Breached', 'Daily drawdown limit exceeded. Account closed.', 'error');
    PERFORM public.send_telegram(
      '🚫 <b>Daily Drawdown Breach</b>' || E'\n'
      || 'Login: ' || COALESCE(acct.mt5_login, 'N/A') || E'\n'
      || round(daily_dd_pct,2) || '% exceeded ' || ch.max_daily_drawdown_percent || '% limit' || E'\n'
      || '👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>'
    );
    RETURN NEW;
  END IF;

  -- Overall drawdown breach check
  IF dd_pct >= ch.max_drawdown_percent THEN
    UPDATE public.trader_accounts
      SET status = 'breached',
          breach_reason = CASE ch.drawdown_type
            WHEN 'static_balance' THEN
              'Max static drawdown ' || round(dd_pct,2) || '% exceeded ' || ch.max_drawdown_percent || '% (starting balance: ' || round(acct.starting_balance) || ')'
            ELSE
              'Max trailing drawdown ' || round(dd_pct,2) || '% exceeded ' || ch.max_drawdown_percent || '% (peak: ' || round(current_peak) || ')'
          END
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, 'Account Breached', 'Drawdown limit exceeded. Account closed.', 'error');
    PERFORM public.send_telegram(
      CASE ch.drawdown_type
        WHEN 'static_balance' THEN '🚫 <b>Static Drawdown Breach</b>'
        ELSE '🚫 <b>Trailing Drawdown Breach</b>'
      END || E'\n'
      || 'Login: ' || COALESCE(acct.mt5_login, 'N/A') || E'\n'
      || round(dd_pct,2) || '% exceeded ' || ch.max_drawdown_percent || '% limit' || E'\n'
      || '👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>'
    );
    RETURN NEW;
  END IF;

  -- ── Phase progression detection ──────────────────────────────────
  -- Single-phase challenge (phases = 1): skip straight to funded
  IF ch.phases = 1 AND acct.current_phase = 1 AND profit_pct >= ch.profit_target_percent
     AND acct.phase_progression_pending IS NULL THEN
    UPDATE public.trader_accounts
      SET phase_progression_pending = 'funded',
          phase2_passed_at = COALESCE(phase2_passed_at, now())
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, '🏆 Profit Target Hit!',
        'You hit your profit target! Your funded account is being provisioned automatically. Check back in a moment.',
        'success');
    PERFORM public.send_telegram(
      '🏆 <b>Profit Target Hit (Single-Phase)</b>' || E'\n'
      || 'Account: ' || COALESCE(acct.mt5_login, acct.id::text) || E'\n'
      || 'Phase: 1 → Funded' || E'\n'
      || 'Profit: ' || round(profit_pct, 2) || '%' || E'\n'
      || 'Trading Days: ' || acct.trading_days || E'\n'
      || 'Status: Checking remaining criteria...' || E'\n'
      || '👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>'
    );
    RETURN NEW;
  END IF;

  -- Multi-phase: Phase 1 complete → provision Phase 2
  IF acct.current_phase = 1 AND ch.phases >= 2
     AND profit_pct >= ch.profit_target_percent
     AND acct.phase_progression_pending IS NULL THEN
    UPDATE public.trader_accounts
      SET phase_progression_pending = 'phase2',
          phase1_passed_at = COALESCE(phase1_passed_at, now())
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, '🎯 Phase 1 Target Hit!',
        'You hit your profit target! A new Phase 2 account is being provisioned automatically. Check back in a moment.',
        'success');
    PERFORM public.send_telegram(
      '🎯 <b>Profit Target Hit</b>' || E'\n'
      || 'Account: ' || COALESCE(acct.mt5_login, acct.id::text) || E'\n'
      || 'Phase: ' || acct.current_phase || E'\n'
      || 'Profit: ' || round(profit_pct, 2) || '%' || E'\n'
      || 'Trading Days: ' || acct.trading_days || E'\n'
      || 'Status: Checking remaining criteria...' || E'\n'
      || '👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>'
    );
    RETURN NEW;
  END IF;

  -- Multi-phase: Final phase complete → provision funded
  IF acct.current_phase >= ch.phases AND ch.phases >= 2
     AND profit_pct >= ch.profit_target_percent
     AND acct.phase_progression_pending IS NULL THEN
    UPDATE public.trader_accounts
      SET phase_progression_pending = 'funded',
          phase2_passed_at = COALESCE(phase2_passed_at, now())
      WHERE id = acct.id;
    INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (acct.user_id, '🏆 Final Phase Target Hit!',
        'You hit your profit target! Your funded account is being provisioned automatically. Check back in a moment.',
        'success');
    PERFORM public.send_telegram(
      '🏆 <b>Profit Target Hit</b>' || E'\n'
      || 'Account: ' || COALESCE(acct.mt5_login, acct.id::text) || E'\n'
      || 'Phase: ' || acct.current_phase || ' → Funded' || E'\n'
      || 'Profit: ' || round(profit_pct, 2) || '%' || E'\n'
      || 'Trading Days: ' || acct.trading_days || E'\n'
      || 'Status: Checking remaining criteria...' || E'\n'
      || '👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>'
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_trading_rules() IS 'Handles drawdown breaches and sets phase_progression_pending for automatic phase provisioning. Triggered on INSERT into account_snapshots.';
