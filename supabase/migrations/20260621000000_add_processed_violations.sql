CREATE TABLE IF NOT EXISTS public.processed_violations (
    id BIGSERIAL PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.trader_accounts(id) ON DELETE CASCADE,
    ticket BIGINT NOT NULL,
    violation_type TEXT NOT NULL CHECK (violation_type IN ('scalping', 'news', 'weekend')),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, ticket, violation_type)
);

CREATE INDEX IF NOT EXISTS idx_processed_violations_lookup
    ON public.processed_violations (account_id, violation_type, ticket);
