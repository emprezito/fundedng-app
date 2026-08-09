-- 1. Fix affiliate commission trigger to divide by 100 (kobo → naira)
CREATE OR REPLACE FUNCTION public.handle_paid_order_affiliate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- mark referral as having a paid order
  UPDATE public.referrals
    SET first_paid_at = COALESCE(first_paid_at, now())
    WHERE referred_user_id = NEW.user_id;

  -- 10% commission. amount_paid is in kobo (Paystack), divide by 100 → naira.
  commission_naira := floor(NEW.amount_paid * 0.10 / 100)::bigint;

  INSERT INTO public.affiliate_commissions(affiliate_user_id, referred_user_id, order_id, amount_naira, status)
  VALUES (ref_id, NEW.user_id, NEW.id, commission_naira, 'available')
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.affiliate_profiles
    SET total_earned_naira = total_earned_naira + commission_naira,
        updated_at = now()
    WHERE user_id = ref_id;

  -- count distinct paid referrals
  SELECT count(*) INTO paid_count
  FROM public.referrals
  WHERE referrer_id = ref_id AND first_paid_at IS NOT NULL;

  SELECT free_accounts_credited INTO current_credited
  FROM public.affiliate_profiles WHERE user_id = ref_id;

  -- 5 free accounts per 5 paid referrals
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
$function$;

-- 2. Function to auto-mark approved affiliate payouts as paid after 24h
CREATE OR REPLACE FUNCTION public.auto_pay_approved_affiliate_payouts()
 RETURNS int
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count int;
BEGIN
  WITH upd AS (
    UPDATE public.affiliate_payouts
      SET status = 'paid', paid_at = now()
      WHERE status = 'approved'
        AND approved_at IS NOT NULL
        AND approved_at <= now() - interval '24 hours'
      RETURNING 1
  )
  SELECT count(*) INTO updated_count FROM upd;
  RETURN updated_count;
END;
$function$;

-- 3. Schedule auto-pay every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('auto-pay-affiliate-payouts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-pay-affiliate-payouts',
  '*/5 * * * *',
  $$ SELECT public.auto_pay_approved_affiliate_payouts(); $$
);