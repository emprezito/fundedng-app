-- Remove NOT NULL from account_size_ngn to allow USD-only accounts
ALTER TABLE public.account_pool
ALTER COLUMN account_size_ngn DROP NOT NULL;
