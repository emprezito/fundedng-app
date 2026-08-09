-- Enable Realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trader_accounts;
