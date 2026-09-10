-- =====================================================================
-- Titan challenges + restricted instruments rule
-- =====================================================================
-- Titan-category challenges enforce a restricted-instrument list. Any
-- position/deal on a restricted symbol prefix (e.g. XAUUSD, XAUUSDm,
-- XAUUSDc) is a breach. Classic challenges leave restricted_symbols
-- empty, so the rule is a no-op for them.

-- 1. Challenge category: backfills every existing row to 'classic'
--    (NOT NULL DEFAULT applies to existing rows on table rewrite).
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'classic';

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_category_check
  CHECK (category IN ('classic', 'titan'));

-- 2. Restricted instrument prefixes per challenge (broker-suffix agnostic:
--    store the bare prefix, matching happens app/monitor-side).
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS restricted_symbols text[] NOT NULL DEFAULT '{}';

-- 3. Five inactive Titan challenge rows (enabled via admin panel later).
--    Currency defaults to 'NGN' (existing NGN rows use the same default).
INSERT INTO public.challenges (
  name, account_size, price_naira, category, challenge_type, phases,
  profit_target_percent, max_drawdown_percent, max_daily_drawdown_percent,
  min_trading_days, drawdown_type, restricted_symbols, is_active, currency
) VALUES
  ('Titan 1M', 1000000, 10000, 'titan', 'standard', 2, 10.00, 15.00, 6.00, 0, 'trailing_equity', ARRAY['XAUUSD','BTCUSD'], false, 'NGN'),
  ('Titan 2M', 2000000, 18000, 'titan', 'standard', 2, 10.00, 15.00, 6.00, 0, 'trailing_equity', ARRAY['XAUUSD','BTCUSD'], false, 'NGN'),
  ('Titan 3M', 3000000, 25000, 'titan', 'standard', 2, 10.00, 15.00, 6.00, 0, 'trailing_equity', ARRAY['XAUUSD','BTCUSD'], false, 'NGN'),
  ('Titan 5M', 5000000, 38000, 'titan', 'standard', 2, 10.00, 15.00, 6.00, 0, 'trailing_equity', ARRAY['XAUUSD','BTCUSD'], false, 'NGN'),
  ('Titan 10M', 10000000, 65000, 'titan', 'standard', 2, 10.00, 15.00, 6.00, 0, 'trailing_equity', ARRAY['XAUUSD','BTCUSD'], false, 'NGN');

-- 4. Allow 'restricted_symbol' in the violation-dedup constraint.
ALTER TABLE public.processed_violations
  DROP CONSTRAINT IF EXISTS processed_violations_violation_type_check;

ALTER TABLE public.processed_violations
  ADD CONSTRAINT processed_violations_violation_type_check
  CHECK (violation_type IN ('scalping', 'news', 'weekend', 'positions', 'restricted_symbol'));