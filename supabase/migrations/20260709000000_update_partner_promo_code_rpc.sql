-- RPC to safely update a partner's promo code with uniqueness check

CREATE OR REPLACE FUNCTION public.update_partner_promo_code(
  _partner_profile_id uuid,
  _new_code text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := upper(trim(regexp_replace(_new_code, '[^A-Za-z0-9]', '', 'g')));
  IF length(cleaned) < 3 THEN
    RAISE EXCEPTION 'Promo code must be at least 3 alphanumeric characters';
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_profiles WHERE promo_code = cleaned AND id <> _partner_profile_id) THEN
    RAISE EXCEPTION 'Promo code "%" is already taken', cleaned;
  END IF;
  UPDATE public.partner_profiles SET promo_code = cleaned, updated_at = now() WHERE id = _partner_profile_id;
  RETURN true;
END;
$$;

-- Allow partners to update (needed if partner dashboard adds editing later)
GRANT EXECUTE ON FUNCTION public.update_partner_promo_code TO authenticated;
