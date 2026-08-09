-- ============================================================
-- Fix "notifications_user_id_fkey" violation on order paid
--
-- Root cause: handle_paid_order_partner and
-- handle_paid_order_affiliate triggers insert notifications for
-- the referrer user (partner_referred_by / referred_by) without
-- verifying that user still exists in auth.users. If the referrer
-- was deleted, the FK constraint fails.
--
-- Fix:
--   1. Clean up dangling referrer pointers in profiles
--   2. Replace both trigger functions with versions that guard
--      on auth.users existence before inserting notifications
-- ============================================================

-- ---- 1. Clean up bad data ----
UPDATE public.profiles
SET referred_by = NULL
WHERE referred_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = referred_by);

UPDATE public.profiles
SET partner_referred_by = NULL
WHERE partner_referred_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = partner_referred_by);

-- ---- 2. Fix handle_paid_order_affiliate ----
CREATE OR REPLACE FUNCTION public.handle_paid_order_affiliate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ref_id uuid;
  paid_count int;
  new_credits int;
  current_credited int;
BEGIN
  IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  SELECT referred_by INTO ref_id FROM public.profiles WHERE id = NEW.user_id;
  IF ref_id IS NULL OR ref_id = NEW.user_id THEN RETURN NEW; END IF;

  -- skip if referrer was deleted from auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = ref_id) THEN RETURN NEW; END IF;

  UPDATE public.referrals
    SET first_paid_at = COALESCE(first_paid_at, now())
    WHERE referred_user_id = NEW.user_id;

  INSERT INTO public.affiliate_commissions(affiliate_user_id, referred_user_id, order_id, amount_naira, status)
  VALUES (ref_id, NEW.user_id, NEW.id, floor(NEW.amount_paid * 0.10)::bigint, 'available')
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.affiliate_profiles
    SET total_earned_naira = total_earned_naira + floor(NEW.amount_paid * 0.10)::bigint,
        updated_at = now()
    WHERE user_id = ref_id;

  SELECT count(*) INTO paid_count
  FROM public.referrals
  WHERE referrer_id = ref_id AND first_paid_at IS NOT NULL;

  SELECT free_accounts_credited INTO current_credited
  FROM public.affiliate_profiles WHERE user_id = ref_id;

  new_credits := (paid_count / 5) * 5 - COALESCE(current_credited,0);
  IF new_credits > 0 THEN
    UPDATE public.affiliate_profiles
      SET free_accounts_credited = free_accounts_credited + new_credits
      WHERE user_id = ref_id;
    INSERT INTO public.notifications(user_id,title,message,type)
    VALUES (ref_id, '🎁 Free Accounts Unlocked',
      'You earned ' || new_credits || ' free 200k challenge account(s) from your referrals.', 'success');
  END IF;

  INSERT INTO public.notifications(user_id,title,message,type)
  VALUES (ref_id, '💰 Commission Earned',
    'You earned ₦' || to_char(floor(NEW.amount_paid * 0.10), 'FM999,999,999') || ' from a referral purchase.',
    'success');

  RETURN NEW;
END;
$$;

-- ---- 3. Fix handle_paid_order_partner ----
CREATE OR REPLACE FUNCTION public.handle_paid_order_partner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  pid uuid;
  pp RECORD;
  commission_naira bigint;
BEGIN
  IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  SELECT partner_referred_by INTO pid FROM public.profiles WHERE id = NEW.user_id;
  IF pid IS NULL AND NEW.partner_promo_code IS NOT NULL THEN
    SELECT user_id INTO pid FROM public.partner_profiles WHERE promo_code = upper(NEW.partner_promo_code) AND is_active = true;
  END IF;
  IF pid IS NULL OR pid = NEW.user_id THEN RETURN NEW; END IF;

  -- skip if partner was deleted from auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = pid) THEN RETURN NEW; END IF;

  SELECT * INTO pp FROM public.partner_profiles WHERE user_id = pid AND is_active = true;
  IF pp IS NULL THEN RETURN NEW; END IF;

  commission_naira := floor((NEW.amount_paid * pp.commission_rate / 100.0) / 100)::bigint;

  INSERT INTO public.partner_referrals(partner_id, referred_user_id, order_id, commission_amount_naira, amount_paid_naira)
  VALUES (pid, NEW.user_id, NEW.id, commission_naira, floor(NEW.amount_paid/100)::bigint)
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.partner_profiles
    SET total_earned_naira = total_earned_naira + commission_naira, updated_at = now()
    WHERE user_id = pid;

  INSERT INTO public.notifications(user_id,title,message,type)
  VALUES (pid, '💰 Partner Commission Earned',
    'You earned ₦' || to_char(commission_naira,'FM999,999,999') || ' from a referral purchase.',
    'success');

  RETURN NEW;
END;
$$;
