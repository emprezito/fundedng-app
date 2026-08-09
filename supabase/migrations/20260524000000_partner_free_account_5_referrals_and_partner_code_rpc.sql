-- ============================================================
-- 1. Require 5 referral purchases before claiming free 1M account
-- 2. Create RPC to validate partner promo codes from client
-- ============================================================

-- 1. Update claim_partner_free_account to require >=5 referrals
CREATE OR REPLACE FUNCTION public.claim_partner_free_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  pp RECORD;
  claim_id uuid;
  elite_challenge_id uuid;
  partner_profile_name text;
  referral_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Verify active partner profile
  SELECT * INTO pp
  FROM public.partner_profiles
  WHERE user_id = auth.uid() AND is_active = true;
  IF pp IS NULL THEN RAISE EXCEPTION 'No active partner profile. Contact admin to become a partner.'; END IF;

  -- Require at least 5 referral purchases
  SELECT count(*) INTO referral_count
  FROM public.partner_referrals
  WHERE partner_id = auth.uid();
  IF referral_count < 5 THEN
    RAISE EXCEPTION 'You need at least 5 referral purchases to claim your free 1M account. You currently have % referral purchase(s).', referral_count;
  END IF;

  -- One free account per partner
  IF EXISTS (SELECT 1 FROM public.partner_free_accounts WHERE partner_id = auth.uid()) THEN
    RAISE EXCEPTION 'You have already requested your free 1M Elite partnership account.';
  END IF;

  -- Find the Elite 1M challenge (must exist)
  SELECT id INTO elite_challenge_id
  FROM public.challenges
  WHERE name = 'Elite' AND account_size = 1000000 AND is_active = true
  LIMIT 1;

  IF elite_challenge_id IS NULL THEN
    RAISE EXCEPTION 'Elite 1M challenge is not available. Please contact support.';
  END IF;

  -- Create the request with challenge_id pre-filled
  INSERT INTO public.partner_free_accounts(partner_id, challenge_id, account_size, challenge_name)
  VALUES (auth.uid(), elite_challenge_id, 1000000, 'Elite')
  RETURNING id INTO claim_id;

  -- Get partner name for notifications
  SELECT full_name INTO partner_profile_name FROM public.profiles WHERE id = auth.uid();

  -- Notify all admins
  INSERT INTO public.notifications(user_id, title, message, type)
  SELECT p.id, 'New Partner Free Account Request',
    COALESCE(partner_profile_name, 'A partner') || ' requested their free 1M Elite partnership account.',
    'info'
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin';

  -- Send Telegram alert
  PERFORM public.send_telegram(
    '🤝 <b>Partner Free 1M Account Request</b>' || E'\n'
    || 'Partner: <b>' || COALESCE(partner_profile_name, 'Unknown') || '</b>' || E'\n'
    || 'Account: <b>1M Elite Challenge</b>' || E'\n'
    || '👉 <a href="https://app.fundedng.com/admin">Deliver in Admin Panel</a>'
  );

  RETURN claim_id;
END;
$$;

-- 2. RPC to validate a partner promo code (for client-side use)
CREATE OR REPLACE FUNCTION public.validate_partner_code(_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_profiles
    WHERE promo_code = upper(trim(_code))
      AND is_active = true
  )
$$;

-- 3. RPC to delete a partner (admin only)
CREATE OR REPLACE FUNCTION public.delete_partner_role(_partner_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT user_id INTO uid FROM public.partner_profiles WHERE id = _partner_profile_id;
  IF uid IS NULL THEN RAISE EXCEPTION 'Partner not found'; END IF;

  DELETE FROM public.partner_clicks WHERE partner_id = uid;
  DELETE FROM public.partner_referrals WHERE partner_id = uid;
  DELETE FROM public.partner_payouts WHERE partner_id = uid;
  DELETE FROM public.partner_free_accounts WHERE partner_id = uid;

  UPDATE public.profiles SET partner_referred_by = NULL WHERE partner_referred_by = uid;

  DELETE FROM public.partner_profiles WHERE id = _partner_profile_id;

  DELETE FROM public.user_roles WHERE user_id = uid AND role = 'partner';
END;
$$;
