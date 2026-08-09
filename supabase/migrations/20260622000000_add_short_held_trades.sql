CREATE TABLE IF NOT EXISTS public.short_held_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.trader_accounts(id) ON DELETE CASCADE,
    ticket BIGINT NOT NULL,
    symbol TEXT NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ NOT NULL,
    duration_seconds INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_short_held_trades_account
    ON public.short_held_trades (account_id, closed_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.short_held_trades;

-- RLS: traders can only see their own short_held_trades (via trader_accounts join)
ALTER TABLE public.short_held_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Traders view own short_held_trades" ON public.short_held_trades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trader_accounts
      WHERE trader_accounts.id = short_held_trades.account_id
        AND trader_accounts.user_id = auth.uid()
    )
  );

-- Admin view all
CREATE POLICY "Admins view all short_held_trades" ON public.short_held_trades
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only server-side cron can insert (same pattern as other violation tables)
CREATE POLICY "Cron insert short_held_trades" ON public.short_held_trades
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
