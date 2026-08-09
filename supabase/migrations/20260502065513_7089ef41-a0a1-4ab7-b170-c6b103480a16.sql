CREATE OR REPLACE FUNCTION public.increment_discount_redemption(_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF _code IS NULL OR trim(_code) = '' THEN RETURN; END IF;

  UPDATE public.discount_codes
  SET redemption_count = redemption_count + 1,
      updated_at = now()
  WHERE code = upper(trim(_code))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_redemptions IS NULL OR redemption_count < max_redemptions);
END;
$$;