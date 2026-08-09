-- Fix affiliate commission calculation: amount_paid is in kobo (Paystack),
-- so we must divide by 100 to convert to naira. The previous migration
-- (20260519000001) inadvertently dropped the /100 when replacing the
-- function to add the auth.users existence guard.
--
-- This also fixes the notification message to use the correct naira value.

CREATE OR REPLACE FUNCTION public.handle_paid_order_affiliate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ref_id uuid;
  paid_count int;
  new_credits int;
  current_credited int;
  commission_naira bigint;
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

  -- 10% commission. amount_paid is in kobo (Paystack), divide by 100 to get naira.
  commission_naira := floor(NEW.amount_paid * 0.10 / 100)::bigint;

  INSERT INTO public.affiliate_commissions(affiliate_user_id, referred_user_id, order_id, amount_naira, status)
  VALUES (ref_id, NEW.user_id, NEW.id, commission_naira, 'available')
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.affiliate_profiles
    SET total_earned_naira = total_earned_naira + commission_naira,
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
    'You earned ₦' || to_char(commission_naira, 'FM999,999,999') || ' from a referral purchase.',
    'success');

  RETURN NEW;
END;
$$;
