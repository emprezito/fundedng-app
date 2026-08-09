-- =========================================================================
-- 1) Fix free-account credit math: 1 free account per 5 paid referrals,
--    capped at 5 lifetime per affiliate (5 referrals = 1, 25 referrals = 5).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_paid_order_affiliate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ref_id uuid;
  paid_count int;
  earned_credits int;
  current_credited int;
  new_credits int;
  commission_naira bigint;
BEGIN
  IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  SELECT referred_by INTO ref_id FROM public.profiles WHERE id = NEW.user_id;
  IF ref_id IS NULL OR ref_id = NEW.user_id THEN RETURN NEW; END IF;

  UPDATE public.referrals
    SET first_paid_at = COALESCE(first_paid_at, now())
    WHERE referred_user_id = NEW.user_id;

  -- 10% commission. amount_paid is in kobo, /100 → naira.
  commission_naira := floor(NEW.amount_paid * 0.10 / 100)::bigint;

  INSERT INTO public.affiliate_commissions(affiliate_user_id, referred_user_id, order_id, amount_naira, status)
  VALUES (ref_id, NEW.user_id, NEW.id, commission_naira, 'available')
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.affiliate_profiles
    SET total_earned_naira = total_earned_naira + commission_naira,
        updated_at = now()
    WHERE user_id = ref_id;

  -- Distinct paid referrals
  SELECT count(*) INTO paid_count
  FROM public.referrals
  WHERE referrer_id = ref_id AND first_paid_at IS NOT NULL;

  SELECT free_accounts_credited INTO current_credited
  FROM public.affiliate_profiles WHERE user_id = ref_id;

  -- 1 free account per 5 paid referrals, capped at 5 lifetime
  earned_credits := LEAST(5, floor(paid_count / 5)::int);
  new_credits := earned_credits - COALESCE(current_credited, 0);

  IF new_credits > 0 THEN
    UPDATE public.affiliate_profiles
      SET free_accounts_credited = free_accounts_credited + new_credits
      WHERE user_id = ref_id;
    INSERT INTO public.notifications(user_id,title,message,type)
    VALUES (ref_id, '🎁 Free Account Unlocked',
      'You earned ' || new_credits || ' free 200k challenge account(s) from your referrals. Claim it from your affiliate dashboard.',
      'success');
  END IF;

  INSERT INTO public.notifications(user_id,title,message,type)
  VALUES (ref_id, '💰 Commission Earned',
    'You earned ₦' || to_char(commission_naira, 'FM999,999,999') || ' from a referral purchase.',
    'success');

  RETURN NEW;
END;
$function$;

-- Backfill: recompute free_accounts_credited for everyone
UPDATE public.affiliate_profiles ap
SET free_accounts_credited = LEAST(5, floor(sub.paid_count / 5)::int)
FROM (
  SELECT referrer_id, count(*) AS paid_count
  FROM public.referrals
  WHERE first_paid_at IS NOT NULL
  GROUP BY referrer_id
) sub
WHERE ap.user_id = sub.referrer_id;

-- =========================================================================
-- 2) Migrate claim_free_account: write to affiliate_free_accounts (which has
--    delivery fields + admin trigger), so admins can deliver MT5 creds.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.claim_free_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ap RECORD;
  available int;
  next_batch int;
  claim_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO ap FROM public.affiliate_profiles WHERE user_id = auth.uid();
  IF ap IS NULL THEN RAISE EXCEPTION 'No affiliate profile'; END IF;
  available := ap.free_accounts_credited - ap.free_accounts_claimed;
  IF available <= 0 THEN RAISE EXCEPTION 'No free accounts available'; END IF;

  next_batch := ap.free_accounts_claimed + 1;

  UPDATE public.affiliate_profiles
    SET free_accounts_claimed = free_accounts_claimed + 1,
        updated_at = now()
    WHERE user_id = auth.uid();

  INSERT INTO public.affiliate_free_accounts(
    affiliate_id, referral_batch, status, account_size, challenge_name
  ) VALUES (
    auth.uid(), next_batch, 'pending', 200000, '200k Free Challenge'
  )
  RETURNING id INTO claim_id;

  RETURN claim_id;
END;
$function$;

-- =========================================================================
-- 3) Backfill: re-clamp anyone who was over-credited under the old 5-per-5
--    rule. Don't reduce below already-claimed count.
-- =========================================================================
UPDATE public.affiliate_profiles ap
SET free_accounts_credited = GREATEST(
  free_accounts_claimed,
  LEAST(5, COALESCE(sub.paid_count / 5, 0))
)
FROM (
  SELECT referrer_id, count(*) AS paid_count
  FROM public.referrals
  WHERE first_paid_at IS NOT NULL
  GROUP BY referrer_id
) sub
WHERE ap.user_id = sub.referrer_id;
