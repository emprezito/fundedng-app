-- Fix peak_equity for accounts that passed Phase 1 but have peak_equity
-- incorrectly carried over from Phase 1 trading (backfill bug in trailing_drawdown migration)
UPDATE public.trader_accounts
SET peak_equity = starting_balance
WHERE current_phase = 2
  AND status = 'active'
  AND phase1_passed_at IS NOT NULL
  AND peak_equity > starting_balance;

-- Fix funded accounts too
UPDATE public.trader_accounts
SET peak_equity = starting_balance
WHERE status = 'funded'
  AND phase2_passed_at IS NOT NULL
  AND peak_equity > starting_balance;
