-- Add USD support to account_pool
ALTER TABLE public.account_pool 
ADD COLUMN IF NOT EXISTS account_size_usd NUMERIC DEFAULT NULL;

ALTER TABLE public.account_pool
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN';
