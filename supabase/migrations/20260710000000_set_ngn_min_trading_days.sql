-- Set minimum trading days to 3 for all NGN standard challenges
-- Instant challenges (min_trading_days = 5) and USD challenges are not affected
UPDATE public.challenges
SET min_trading_days = 3
WHERE (currency IS NULL OR currency = 'NGN')
  AND (challenge_type IS NULL OR challenge_type != 'instant')
  AND min_trading_days < 3;
