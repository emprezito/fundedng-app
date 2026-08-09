-- =====================================================
-- Partner Free Account: 1M Elite Delivery Rewrite
-- =====================================================
-- Problem: The delivery logic looked up challenge by account_size + name,
-- which was fragile and failed when the challenge didn't match exactly.
-- 
-- Solution: Store challenge_id directly on partner_free_accounts so
-- delivery is a simple reference, not a lookup.
-- =====================================================

-- 1. Make order_id nullable on trader_accounts (for partner free accounts that have no order)
ALTER TABLE public.trader_accounts
  ALTER COLUMN order_id DROP NOT NULL;

-- 2. Add challenge_id column to partner_free_accounts
ALTER TABLE public.partner_free_accounts
  ADD COLUMN IF NOT EXISTS challenge_id uuid REFERENCES public.challenges(id);

-- 2. Backfill challenge_id for existing rows using the Elite 1M challenge
UPDATE public.partner_free_accounts
SET challenge_id = c.id
FROM public.challenges c
WHERE c.name = 'Elite' AND c.account_size = 1000000
  AND partner_free_accounts.challenge_id IS NULL;

-- 3. Create or replace the claim function to always use Elite 1M challenge
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Verify active partner profile
  SELECT * INTO pp
  FROM public.partner_profiles
  WHERE user_id = auth.uid() AND is_active = true;
  IF pp IS NULL THEN RAISE EXCEPTION 'No active partner profile. Contact admin to become a partner.'; END IF;

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

-- 4. Update the delivery trigger to include challenge info in notification
CREATE OR REPLACE FUNCTION public.tg_partner_free_account_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'fulfilled'
     AND NEW.mt5_login IS NOT NULL
  THEN
    NEW.fulfilled_at := COALESCE(NEW.fulfilled_at, now());

    INSERT INTO public.notifications(user_id, title, message, type)
    VALUES (
      NEW.partner_id,
      '🎉 Your 1M Elite Partnership Account is Ready',
      'Login: ' || NEW.mt5_login
        || ' · Server: ' || COALESCE(NEW.mt5_server, 'See dashboard')
        || ' · Account Size: ₦1,000,000 (Elite)'
        || '. Check your partner dashboard for full credentials. Start trading!',
      'success'
    );

    -- Also send Telegram notification
    PERFORM public.send_telegram(
      '✅ <b>Partner 1M Account Delivered</b>' || E'\n'
      || 'Login: <code>' || NEW.mt5_login || '</code>' || E'\n'
      || 'Server: <code>' || COALESCE(NEW.mt5_server, '-') || '</code>' || E'\n'
      || 'Partner ID: <code>' || NEW.partner_id || '</code>'
    );
  END IF;
  RETURN NEW;
END;
$$;
