-- Add discount_percent column to challenges table
-- Allows admins to set a manual discount percentage per challenge
-- NULL or 0 means no discount

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100);

COMMENT ON COLUMN public.challenges.discount_percent IS 'Admin-set discount percentage (0-100). Applied as: final_price = price_naira * (1 - discount_percent/100)';
