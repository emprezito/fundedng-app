CREATE TABLE public.closed_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.trader_accounts(id) ON DELETE CASCADE NOT NULL,
  ticket bigint NOT NULL,
  symbol text NOT NULL,
  open_time timestamptz NOT NULL,
  close_time timestamptz NOT NULL,
  duration_seconds int NOT NULL,
  profit numeric(12,2) NOT NULL,
  volume numeric(10,2) NOT NULL,
  trade_type text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX closed_trades_account_ticket ON public.closed_trades(account_id, ticket);

CREATE INDEX closed_trades_account_close_time ON public.closed_trades(account_id, close_time DESC);

ALTER TABLE public.closed_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Traders see own closed trades" ON public.closed_trades
  FOR SELECT USING (
    account_id IN (
      SELECT id FROM public.trader_accounts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert" ON public.closed_trades
  FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.closed_trades;
