ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.validate_discount_code;
CREATE OR REPLACE FUNCTION public.validate_discount_code(_code text, _challenge_id uuid DEFAULT NULL)
RETURNS TABLE(code text, percent_off numeric, challenge_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT dc.code, dc.percent_off, dc.challenge_id
  FROM public.discount_codes dc
  WHERE dc.code = upper(trim(_code))
    AND dc.is_active = true
    AND (dc.expires_at IS NULL OR dc.expires_at > now())
    AND (dc.max_redemptions IS NULL OR dc.redemption_count < dc.max_redemptions)
    AND (dc.challenge_id IS NULL OR dc.challenge_id = _challenge_id)
  LIMIT 1
$$;
