-- Fix partner free account to be 1M (Elite) 2-step challenge
ALTER TABLE public.partner_free_accounts
  ALTER COLUMN account_size SET DEFAULT 1000000,
  ALTER COLUMN challenge_name SET DEFAULT 'Elite';

-- Update any existing partner free accounts to correct values
UPDATE public.partner_free_accounts
SET account_size = 1000000, challenge_name = 'Elite'
WHERE account_size != 1000000 OR challenge_name != 'Elite';
