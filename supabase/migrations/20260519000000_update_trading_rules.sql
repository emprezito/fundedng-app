-- Update all challenges to require 3 minimum trading days
UPDATE public.challenges SET min_trading_days = 3 WHERE min_trading_days < 3;
