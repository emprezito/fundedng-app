-- ── BACKFILL: live_activity from past events ─────────────────────────────────

-- Backfill payout_paid events from all paid payouts
INSERT INTO public.live_activity (event_type, anonymized_name, avatar_initials, challenge_name, currency, amount, account_size, created_at)
SELECT
  'payout_paid',
  COALESCE(NULLIF(TRIM(pr.full_name), ''), 'Trader'),
  CASE
    WHEN pr.full_name IS NULL OR TRIM(pr.full_name) = '' THEN '??'
    WHEN array_length(string_to_array(trim(pr.full_name), ' '), 1) >= 2
      THEN upper(left(split_part(trim(pr.full_name), ' ', 1), 1))
           || upper(left(split_part(trim(pr.full_name), ' ', 2), 1))
    ELSE upper(left(trim(pr.full_name), 2))
  END,
  COALESCE(ch.name, ''),
  COALESCE(ta.currency, 'NGN'),
  CASE WHEN ta.currency = 'USD' THEN ROUND(p.amount_naira::numeric / 1550, 2) ELSE p.amount_naira::numeric END,
  ta.starting_balance,
  COALESCE(p.processed_at, p.created_at)
FROM public.payouts p
JOIN public.trader_accounts ta ON ta.id = p.trader_account_id
JOIN public.profiles pr ON pr.id = p.user_id
LEFT JOIN public.challenges ch ON ch.id = ta.challenge_id
WHERE p.status = 'paid';

-- Backfill phase2_approved events from accounts that have phase1_passed_at set
INSERT INTO public.live_activity (event_type, anonymized_name, avatar_initials, challenge_name, currency, account_size, created_at)
SELECT
  'phase2_approved',
  COALESCE(NULLIF(TRIM(pr.full_name), ''), 'Trader'),
  CASE
    WHEN pr.full_name IS NULL OR TRIM(pr.full_name) = '' THEN '??'
    WHEN array_length(string_to_array(trim(pr.full_name), ' '), 1) >= 2
      THEN upper(left(split_part(trim(pr.full_name), ' ', 1), 1))
           || upper(left(split_part(trim(pr.full_name), ' ', 2), 1))
    ELSE upper(left(trim(pr.full_name), 2))
  END,
  COALESCE(ch.name, ''),
  COALESCE(ta.currency, 'NGN'),
  ta.starting_balance,
  ta.phase1_passed_at
FROM public.trader_accounts ta
JOIN public.profiles pr ON pr.id = ta.user_id
LEFT JOIN public.challenges ch ON ch.id = ta.challenge_id
WHERE ta.phase1_passed_at IS NOT NULL
  AND ta.id NOT IN (
    SELECT ta2.id FROM public.trader_accounts ta2
    WHERE ta2.current_phase >= 2 AND ta2.status != 'passed'
  );

-- Backfill funded_approved events from accounts with funded_at set
INSERT INTO public.live_activity (event_type, anonymized_name, avatar_initials, challenge_name, currency, account_size, created_at)
SELECT
  'funded_approved',
  COALESCE(NULLIF(TRIM(pr.full_name), ''), 'Trader'),
  CASE
    WHEN pr.full_name IS NULL OR TRIM(pr.full_name) = '' THEN '??'
    WHEN array_length(string_to_array(trim(pr.full_name), ' '), 1) >= 2
      THEN upper(left(split_part(trim(pr.full_name), ' ', 1), 1))
           || upper(left(split_part(trim(pr.full_name), ' ', 2), 1))
    ELSE upper(left(trim(pr.full_name), 2))
  END,
  COALESCE(ch.name, ''),
  COALESCE(ta.currency, 'NGN'),
  ta.starting_balance,
  ta.funded_at
FROM public.trader_accounts ta
JOIN public.profiles pr ON pr.id = ta.user_id
LEFT JOIN public.challenges ch ON ch.id = ta.challenge_id
WHERE ta.funded_at IS NOT NULL;

-- ── BACKFILL: leaderboard_cache from all active/funded accounts ──────────────

INSERT INTO public.leaderboard_cache (
  user_id, account_id, anonymized_name, avatar_initials, challenge_name,
  currency, starting_balance, monthly_profit, monthly_profit_percent,
  total_return_percent, total_payouts, payout_count, status, current_phase,
  trading_days, last_updated_at
)
SELECT
  ta.user_id,
  ta.id,
  COALESCE(NULLIF(TRIM(pr.full_name), ''), 'Trader'),
  CASE
    WHEN pr.full_name IS NULL OR TRIM(pr.full_name) = '' THEN '??'
    WHEN array_length(string_to_array(trim(pr.full_name), ' '), 1) >= 2
      THEN upper(left(split_part(trim(pr.full_name), ' ', 1), 1))
           || upper(left(split_part(trim(pr.full_name), ' ', 2), 1))
    ELSE upper(left(trim(pr.full_name), 2))
  END,
  COALESCE(ch.name, ''),
  COALESCE(ta.currency, 'NGN'),
  ta.starting_balance,
  0,
  0,
  0,
  COALESCE((
    SELECT SUM(p.amount_naira)
    FROM public.payouts p
    WHERE p.trader_account_id = ta.id AND p.status = 'paid' 
  ), 0),
  COALESCE((
    SELECT COUNT(*)
    FROM public.payouts p
    WHERE p.trader_account_id = ta.id AND p.status = 'paid'
  ), 0),
  ta.status,
  ta.current_phase,
  COALESCE(ta.trading_days, 0),
  now()
FROM public.trader_accounts ta
JOIN public.profiles pr ON pr.id = ta.user_id
LEFT JOIN public.challenges ch ON ch.id = ta.challenge_id
WHERE ta.status IN ('active', 'funded');

-- ── DROP OPT-IN: make everyone visible by default ───────────────────────────

UPDATE public.profiles SET leaderboard_opt_in = true;

ALTER TABLE public.profiles
  ALTER COLUMN leaderboard_opt_in SET DEFAULT true;
