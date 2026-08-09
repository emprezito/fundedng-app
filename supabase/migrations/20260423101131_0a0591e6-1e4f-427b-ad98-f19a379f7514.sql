-- Track MetaApi account IDs and provider source on trader_accounts
ALTER TABLE public.trader_accounts
  ADD COLUMN IF NOT EXISTS metaapi_account_id text,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS investor_password text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_trader_accounts_metaapi ON public.trader_accounts(metaapi_account_id) WHERE metaapi_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trader_accounts_status_provider ON public.trader_accounts(status, provider);

-- Allow account_requests to be marked failed and store provider response
ALTER TABLE public.account_requests
  ADD COLUMN IF NOT EXISTS provider_response jsonb;

-- Schedule equity sync every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop existing schedule if it exists, then recreate
DO $$
BEGIN
  PERFORM cron.unschedule('mt5-equity-sync-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'mt5-equity-sync-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--32d51fa4-0ae5-4f6a-96a0-1e0f70b63085.lovable.app/api/public/cron/sync-equity',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);