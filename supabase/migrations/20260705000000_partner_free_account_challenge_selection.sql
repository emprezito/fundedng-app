-- ============================================================
-- Partner Free Account: Admin-configurable challenge selection
-- ============================================================
-- Allows admin to choose which challenge a partner receives
-- as their free account (instead of always Elite 1M).
-- Setting free_account_challenge_id = NULL means no free account.
-- ============================================================

-- 1. Add free_account_challenge_id to partner_profiles
ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS free_account_challenge_id uuid REFERENCES public.challenges(id);

-- 2. Backfill existing partners with Elite 1M challenge
UPDATE public.partner_profiles
SET free_account_challenge_id = c.id
FROM public.challenges c
WHERE c.name = 'Elite' AND c.account_size = 1000000
  AND partner_profiles.free_account_challenge_id IS NULL;

-- 3. Update claim_partner_free_account to use the partner's configured challenge
CREATE OR REPLACE FUNCTION public.claim_partner_free_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  pp RECORD;
  claim_id uuid;
  challenge_id uuid;
  challenge_row RECORD;
  partner_profile_name text;
  referral_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Verify active partner profile
  SELECT * INTO pp
  FROM public.partner_profiles
  WHERE user_id = auth.uid() AND is_active = true;
  IF pp IS NULL THEN RAISE EXCEPTION 'No active partner profile. Contact admin to become a partner.'; END IF;

  -- Check if partner has a free account challenge configured
  IF pp.free_account_challenge_id IS NULL THEN
    RAISE EXCEPTION 'Your partner plan does not include a free account. Contact admin for details.';
  END IF;

  -- Require at least 5 referral purchases
  SELECT count(*) INTO referral_count
  FROM public.partner_referrals
  WHERE partner_id = auth.uid();
  IF referral_count < 5 THEN
    RAISE EXCEPTION 'You need at least 5 referral purchases to claim your free account. You currently have % referral purchase(s).', referral_count;
  END IF;

  -- One free account per partner
  IF EXISTS (SELECT 1 FROM public.partner_free_accounts WHERE partner_id = auth.uid()) THEN
    RAISE EXCEPTION 'You have already requested your free partnership account.';
  END IF;

  -- Verify the configured challenge still exists and is active
  SELECT * INTO challenge_row
  FROM public.challenges
  WHERE id = pp.free_account_challenge_id AND is_active = true;

  IF challenge_row IS NULL THEN
    RAISE EXCEPTION 'Your assigned free account challenge is no longer available. Please contact support.';
  END IF;

  -- Create the request with the partner's configured challenge
  INSERT INTO public.partner_free_accounts(partner_id, challenge_id, account_size, challenge_name)
  VALUES (auth.uid(), challenge_row.id, challenge_row.account_size, challenge_row.name)
  RETURNING id INTO claim_id;

  -- Get partner name for notifications
  SELECT full_name INTO partner_profile_name FROM public.profiles WHERE id = auth.uid();

  -- Notify all admins
  INSERT INTO public.notifications(user_id, title, message, type)
  SELECT p.id, 'New Partner Free Account Request',
    COALESCE(partner_profile_name, 'A partner') || ' requested their free ' || challenge_row.name || ' partnership account (' || challenge_row.account_size || ').',
    'info'
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin';

  -- Send Telegram alert
  PERFORM public.send_telegram(
    '🤝 <b>Partner Free Account Request</b>' || E'\n'
    || 'Partner: <b>' || COALESCE(partner_profile_name, 'Unknown') || '</b>' || E'\n'
    || 'Account: <b>' || challenge_row.name || ' (' || challenge_row.account_size || ')</b>' || E'\n'
    || '👉 <a href="https://app.fundedng.com/admin">Deliver in Admin Panel</a>'
  );

  RETURN claim_id;
END;
$$;

-- 4. Update the delivery trigger to use dynamic challenge info
CREATE OR REPLACE FUNCTION public.tg_partner_free_account_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  challenge_row RECORD;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'fulfilled'
     AND NEW.mt5_login IS NOT NULL
  THEN
    NEW.fulfilled_at := COALESCE(NEW.fulfilled_at, now());

    -- Fetch challenge info for dynamic messaging
    SELECT * INTO challenge_row
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    INSERT INTO public.notifications(user_id, title, message, type)
    VALUES (
      NEW.partner_id,
      '🎉 Your ' || COALESCE(challenge_row.name, 'Partnership') || ' Account is Ready',
      'Login: ' || NEW.mt5_login
        || ' · Server: ' || COALESCE(NEW.mt5_server, 'See dashboard')
        || ' · Account: ' || COALESCE(challenge_row.name, 'Challenge') || ' (' || COALESCE(challenge_row.account_size::text, '—') || ')'
        || '. Check your partner dashboard for full credentials. Start trading!',
      'success'
    );

    -- Also send Telegram notification
    PERFORM public.send_telegram(
      '✅ <b>Partner Free Account Delivered</b>' || E'\n'
      || 'Login: <code>' || NEW.mt5_login || '</code>' || E'\n'
      || 'Server: <code>' || COALESCE(NEW.mt5_server, '-') || '</code>' || E'\n'
      || 'Account: ' || COALESCE(challenge_row.name, 'Challenge') || ' (' || COALESCE(challenge_row.account_size::text, '—') || ')' || E'\n'
      || 'Partner ID: <code>' || NEW.partner_id || '</code>'
    );
  END IF;
  RETURN NEW;
END;
$$;
