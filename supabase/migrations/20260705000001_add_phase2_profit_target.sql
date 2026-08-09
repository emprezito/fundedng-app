-- Allow per-phase profit targets for multi-phase challenges
ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS phase2_profit_target_percent NUMERIC(5,2);
