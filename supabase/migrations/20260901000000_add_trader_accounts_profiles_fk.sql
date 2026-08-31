-- Add missing FK from trader_accounts.user_id -> profiles.id.
--
-- PostgREST embedded resources (SELECT ... profiles(full_name)) require a real
-- foreign-key relationship in the schema cache. This FK was never created, so
-- any server-side query that embeds trader_accounts.profiles() fails at
-- runtime with:
--   "Could not find a relationship between 'trader_accounts' and 'profiles'"
--
-- Apply this manually via the Supabase Dashboard SQL Editor (supabase db push
-- is blocked for this project).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.trader_accounts'::regclass
      AND contype = 'f'
      AND conname = 'trader_accounts_user_id_fkey'
  ) THEN
    ALTER TABLE public.trader_accounts
      ADD CONSTRAINT trader_accounts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
