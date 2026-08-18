-- Backfill: create trader_accounts rows for all existing fulfilled affiliate free accounts
-- that don't already have one. This makes them visible on the trader dashboard and
-- eligible for equity sync, phase progression, and payout requests.

INSERT INTO public.trader_accounts (
  user_id, challenge_id, order_id, mt5_login, mt5_password, investor_password,
  mt5_server, starting_balance, current_equity, current_phase, status, provider, created_at
)
SELECT DISTINCT ON (afa.id)
  afa.affiliate_id,
  ch.id AS challenge_id,
  NULL::uuid AS order_id,
  afa.mt5_login,
  afa.mt5_password,
  afa.investor_password,
  COALESCE(afa.mt5_server, 'Exness-MT5Demo'),
  COALESCE(afa.account_size, 200000),
  COALESCE(afa.account_size, 200000),
  1,
  'active',
  'exness-bot',
  afa.fulfilled_at
FROM public.affiliate_free_accounts afa
JOIN public.challenges ch ON ch.account_size = COALESCE(afa.account_size, 200000)
WHERE afa.status = 'fulfilled'
  AND afa.mt5_login IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.trader_accounts ta
    WHERE ta.user_id = afa.affiliate_id
      AND ta.mt5_login = afa.mt5_login
      AND ta.mt5_server = COALESCE(afa.mt5_server, 'Exness-MT5Demo')
  )
ORDER BY afa.id, ch.created_at DESC;
