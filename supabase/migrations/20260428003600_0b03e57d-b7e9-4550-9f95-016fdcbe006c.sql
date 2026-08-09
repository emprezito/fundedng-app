
-- 1. Add referred_by to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by uuid;

-- 2. Affiliate profile (one row per user, unique referral code)
CREATE TABLE IF NOT EXISTS public.affiliate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  total_earned_naira bigint NOT NULL DEFAULT 0,
  total_paid_naira bigint NOT NULL DEFAULT 0,
  free_accounts_credited int NOT NULL DEFAULT 0,
  free_accounts_claimed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own affiliate" ON public.affiliate_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage affiliate" ON public.affiliate_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. Referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_user_id uuid NOT NULL UNIQUE,
  first_paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own referrals" ON public.referrals FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage referrals" ON public.referrals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. Commissions
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE,
  amount_naira bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own commissions" ON public.affiliate_commissions FOR SELECT TO authenticated
  USING (auth.uid() = affiliate_user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage commissions" ON public.affiliate_commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. Affiliate payouts
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_naira bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  bank_details jsonb,
  admin_note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own affiliate payouts" ON public.affiliate_payouts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create own affiliate payouts" ON public.affiliate_payouts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update affiliate payouts" ON public.affiliate_payouts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 6. Free account claims log (one row per claim)
CREATE TABLE IF NOT EXISTS public.affiliate_free_account_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_size bigint NOT NULL DEFAULT 200000,
  status text NOT NULL DEFAULT 'pending',
  trader_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliate_free_account_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own free claims" ON public.affiliate_free_account_claims FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create own free claims" ON public.affiliate_free_account_claims FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update free claims" ON public.affiliate_free_account_claims FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 7. Function: generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_affiliate_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  c text;
BEGIN
  LOOP
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.affiliate_profiles WHERE code = c);
  END LOOP;
  RETURN c;
END;
$$;

-- 8. Trigger: create affiliate_profile on new user
CREATE OR REPLACE FUNCTION public.handle_new_user_affiliate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.affiliate_profiles(user_id, code)
  VALUES (NEW.id, public.generate_affiliate_code())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_profile_created_affiliate ON public.profiles;
CREATE TRIGGER on_profile_created_affiliate
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_affiliate();

-- Backfill affiliate codes for existing users
INSERT INTO public.affiliate_profiles(user_id, code)
SELECT p.id, public.generate_affiliate_code()
FROM public.profiles p
LEFT JOIN public.affiliate_profiles a ON a.user_id = p.id
WHERE a.id IS NULL;

-- 9. Function: create commission + free-account credit when order is paid
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

  -- mark referral as having a paid order
  UPDATE public.referrals
    SET first_paid_at = COALESCE(first_paid_at, now())
    WHERE referred_user_id = NEW.user_id;

  -- 10% commission
  INSERT INTO public.affiliate_commissions(affiliate_user_id, referred_user_id, order_id, amount_naira, status)
  VALUES (ref_id, NEW.user_id, NEW.id, floor(NEW.amount_paid * 0.10)::bigint, 'available')
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.affiliate_profiles
    SET total_earned_naira = total_earned_naira + floor(NEW.amount_paid * 0.10)::bigint,
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
    'You earned ₦' || to_char(floor(NEW.amount_paid * 0.10), 'FM999,999,999') || ' from a referral purchase.',
    'success');

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_order_paid_affiliate ON public.orders;
CREATE TRIGGER on_order_paid_affiliate
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_paid_order_affiliate();

-- 10. RPC: request affiliate payout
CREATE OR REPLACE FUNCTION public.request_affiliate_payout(_amount bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prof RECORD;
  ap RECORD;
  available bigint;
  pending_total bigint;
  payout_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount < 5000 THEN RAISE EXCEPTION 'Minimum payout is ₦5,000'; END IF;

  SELECT * INTO ap FROM public.affiliate_profiles WHERE user_id = auth.uid();
  IF ap IS NULL THEN RAISE EXCEPTION 'No affiliate profile'; END IF;

  -- pending/approved (not yet rejected/paid) reserve funds
  SELECT COALESCE(sum(amount_naira),0) INTO pending_total
  FROM public.affiliate_payouts
  WHERE user_id = auth.uid() AND status IN ('pending','approved');

  available := ap.total_earned_naira - ap.total_paid_naira - pending_total;
  IF _amount > available THEN
    RAISE EXCEPTION 'Requested amount exceeds available balance (₦%)', available;
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid();
  IF prof.bank_account_number IS NULL THEN
    RAISE EXCEPTION 'Add your bank details first';
  END IF;

  INSERT INTO public.affiliate_payouts(user_id, amount_naira, bank_details)
  VALUES (auth.uid(), _amount, jsonb_build_object(
    'account_number', prof.bank_account_number,
    'bank_name', prof.bank_name,
    'account_name', prof.bank_account_name
  )) RETURNING id INTO payout_id;

  INSERT INTO public.notifications(user_id, title, message, type)
  SELECT p.id, 'New Affiliate Payout Request',
    COALESCE(prof.full_name,'A user') || ' requested ₦' || to_char(_amount,'FM999,999,999') || ' affiliate payout.',
    'info'
  FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin';

  RETURN payout_id;
END;
$$;

-- 11. RPC: claim free 200k account
CREATE OR REPLACE FUNCTION public.claim_free_account()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ap RECORD;
  available int;
  claim_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO ap FROM public.affiliate_profiles WHERE user_id = auth.uid();
  IF ap IS NULL THEN RAISE EXCEPTION 'No affiliate profile'; END IF;
  available := ap.free_accounts_credited - ap.free_accounts_claimed;
  IF available <= 0 THEN RAISE EXCEPTION 'No free accounts available'; END IF;

  UPDATE public.affiliate_profiles
    SET free_accounts_claimed = free_accounts_claimed + 1,
        updated_at = now()
    WHERE user_id = auth.uid();

  INSERT INTO public.affiliate_free_account_claims(user_id, account_size, status)
  VALUES (auth.uid(), 200000, 'pending')
  RETURNING id INTO claim_id;

  INSERT INTO public.notifications(user_id, title, message, type)
  SELECT p.id, 'Free Account Claim',
    COALESCE((SELECT full_name FROM public.profiles WHERE id = auth.uid()),'A user') ||
    ' claimed a free 200k challenge account. Provision it manually.', 'info'
  FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin';

  RETURN claim_id;
END;
$$;

-- 12. RPC: attach a referral on signup (called from client)
CREATE OR REPLACE FUNCTION public.attach_referral(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ref_user uuid;
  current_ref uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _code IS NULL OR length(_code) < 4 THEN RETURN false; END IF;

  SELECT user_id INTO ref_user FROM public.affiliate_profiles WHERE code = upper(_code);
  IF ref_user IS NULL OR ref_user = auth.uid() THEN RETURN false; END IF;

  SELECT referred_by INTO current_ref FROM public.profiles WHERE id = auth.uid();
  IF current_ref IS NOT NULL THEN RETURN false; END IF;

  UPDATE public.profiles SET referred_by = ref_user WHERE id = auth.uid();
  INSERT INTO public.referrals(referrer_id, referred_user_id)
  VALUES (ref_user, auth.uid())
  ON CONFLICT (referred_user_id) DO NOTHING;

  RETURN true;
END;
$$;

-- 13. Trigger: when admin marks affiliate payout as paid, bump total_paid_naira
CREATE OR REPLACE FUNCTION public.handle_affiliate_payout_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    UPDATE public.affiliate_profiles
      SET total_paid_naira = total_paid_naira + NEW.amount_naira,
          updated_at = now()
      WHERE user_id = NEW.user_id;
    NEW.paid_at := COALESCE(NEW.paid_at, now());
    INSERT INTO public.notifications(user_id,title,message,type)
    VALUES (NEW.user_id, '💸 Affiliate Payout Sent',
      '₦' || to_char(NEW.amount_naira,'FM999,999,999') || ' has been paid to your bank.', 'success');
  ELSIF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    INSERT INTO public.notifications(user_id,title,message,type)
    VALUES (NEW.user_id, '✅ Affiliate Payout Approved',
      'Your ₦' || to_char(NEW.amount_naira,'FM999,999,999') || ' payout was approved. Processing within 24 hours.', 'success');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_affiliate_payout_status ON public.affiliate_payouts;
CREATE TRIGGER on_affiliate_payout_status
BEFORE UPDATE ON public.affiliate_payouts
FOR EACH ROW EXECUTE FUNCTION public.handle_affiliate_payout_paid();
