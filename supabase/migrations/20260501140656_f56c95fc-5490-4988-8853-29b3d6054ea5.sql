
-- 1) Extend role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';

-- 2) Profile column for partner referral
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partner_referred_by uuid;

-- 3) Promo code generator: first name + 4 random alphanumeric chars
CREATE OR REPLACE FUNCTION public.gen_partner_promo_code(_full_name text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  base text;
  candidate text;
  suffix text;
BEGIN
  base := upper(regexp_replace(split_part(coalesce(nullif(trim(_full_name), ''), 'PARTNER'), ' ', 1), '[^A-Za-z0-9]', '', 'g'));
  IF base = '' THEN base := 'PARTNER'; END IF;
  IF length(base) > 10 THEN base := substr(base, 1, 10); END IF;
  LOOP
    suffix := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    candidate := base || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.partner_profiles WHERE promo_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

-- 4) partner_profiles
CREATE TABLE IF NOT EXISTS public.partner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  promo_code text NOT NULL UNIQUE,
  commission_rate numeric NOT NULL DEFAULT 20.00,
  total_earned_naira bigint NOT NULL DEFAULT 0,
  total_paid_naira bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage partner profiles" ON public.partner_profiles
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Partners view own profile" ON public.partner_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER partner_profiles_updated BEFORE UPDATE ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) partner_clicks (anonymous-allowed)
CREATE TABLE IF NOT EXISTS public.partner_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code text NOT NULL,
  partner_id uuid,
  user_agent text,
  referer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_clicks_partner_idx ON public.partner_clicks(partner_id);
CREATE INDEX IF NOT EXISTS partner_clicks_code_idx ON public.partner_clicks(promo_code);
ALTER TABLE public.partner_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can record click" ON public.partner_clicks
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Partners view own clicks" ON public.partner_clicks
  FOR SELECT TO authenticated USING (
    partner_id = auth.uid() OR has_role(auth.uid(), 'admin')
  );

-- 6) partner_referrals
CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  order_id uuid UNIQUE,
  commission_amount_naira bigint NOT NULL DEFAULT 0,
  amount_paid_naira bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_referrals_partner_idx ON public.partner_referrals(partner_id);
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage partner referrals" ON public.partner_referrals
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Partners view own referrals" ON public.partner_referrals
  FOR SELECT TO authenticated USING (auth.uid() = partner_id OR has_role(auth.uid(), 'admin'));

-- 7) partner_payouts
CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  amount_naira bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  bank_details jsonb,
  admin_note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_payouts_partner_idx ON public.partner_payouts(partner_id);
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage partner payouts" ON public.partner_payouts
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Partners view own payouts" ON public.partner_payouts
  FOR SELECT TO authenticated USING (auth.uid() = partner_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Partners create own payouts" ON public.partner_payouts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = partner_id);

-- 8) RPC: assign partner role by email (admin-only)
CREATE OR REPLACE FUNCTION public.assign_partner_role(_email text, _commission_rate numeric DEFAULT 20.00)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid;
  pname text;
  code text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _commission_rate < 0 OR _commission_rate > 100 THEN RAISE EXCEPTION 'Commission must be 0-100'; END IF;

  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'No user found with that email'; END IF;

  INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'partner')
    ON CONFLICT (user_id, role) DO NOTHING;

  SELECT full_name INTO pname FROM public.profiles WHERE id = uid;

  INSERT INTO public.partner_profiles(user_id, promo_code, commission_rate)
  VALUES (uid, public.gen_partner_promo_code(coalesce(pname, _email)), _commission_rate)
  ON CONFLICT (user_id) DO UPDATE SET commission_rate = EXCLUDED.commission_rate, is_active = true, updated_at = now();

  INSERT INTO public.notifications(user_id, title, message, type)
  VALUES (uid, '🤝 You are now a Partner', 'Welcome to the FundedNG Partner Program. Open your dashboard at /partner to get your link.', 'success');

  RETURN uid;
END;
$$;

-- 9) RPC: track click (anyone)
CREATE OR REPLACE FUNCTION public.track_partner_click(_code text, _ua text DEFAULT NULL, _ref text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pid uuid;
BEGIN
  IF _code IS NULL OR length(_code) < 4 THEN RETURN false; END IF;
  SELECT user_id INTO pid FROM public.partner_profiles WHERE promo_code = upper(_code) AND is_active = true;
  IF pid IS NULL THEN RETURN false; END IF;
  INSERT INTO public.partner_clicks(promo_code, partner_id, user_agent, referer)
  VALUES (upper(_code), pid, _ua, _ref);
  RETURN true;
END;
$$;

-- 10) RPC: attach partner referral to current user
CREATE OR REPLACE FUNCTION public.attach_partner_referral(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pid uuid;
  current_pref uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _code IS NULL OR length(_code) < 4 THEN RETURN false; END IF;

  SELECT user_id INTO pid FROM public.partner_profiles WHERE promo_code = upper(_code) AND is_active = true;
  IF pid IS NULL OR pid = auth.uid() THEN RETURN false; END IF;

  SELECT partner_referred_by INTO current_pref FROM public.profiles WHERE id = auth.uid();
  IF current_pref IS NOT NULL THEN RETURN false; END IF;

  UPDATE public.profiles SET partner_referred_by = pid WHERE id = auth.uid();
  RETURN true;
END;
$$;

-- 11) RPC: request partner payout (7-day cooldown, ₦5000 min)
CREATE OR REPLACE FUNCTION public.request_partner_payout(_amount bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pp RECORD;
  prof RECORD;
  pending_total bigint;
  available bigint;
  last_at timestamptz;
  pid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount < 5000 THEN RAISE EXCEPTION 'Minimum payout is ₦5,000'; END IF;

  SELECT * INTO pp FROM public.partner_profiles WHERE user_id = auth.uid();
  IF pp IS NULL THEN RAISE EXCEPTION 'No partner profile'; END IF;

  SELECT max(requested_at) INTO last_at FROM public.partner_payouts
  WHERE partner_id = auth.uid() AND status IN ('pending','approved','paid');
  IF last_at IS NOT NULL AND last_at > now() - interval '7 days' THEN
    RAISE EXCEPTION 'You can only request a payout once every 7 days';
  END IF;

  SELECT COALESCE(sum(amount_naira),0) INTO pending_total
  FROM public.partner_payouts WHERE partner_id = auth.uid() AND status IN ('pending','approved');

  available := pp.total_earned_naira - pp.total_paid_naira - pending_total;
  IF _amount > available THEN
    RAISE EXCEPTION 'Requested amount exceeds available balance (₦%)', available;
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid();
  IF prof.bank_account_number IS NULL THEN
    RAISE EXCEPTION 'Add your bank details on the dashboard first';
  END IF;

  INSERT INTO public.partner_payouts(partner_id, amount_naira, bank_details)
  VALUES (auth.uid(), _amount, jsonb_build_object(
    'account_number', prof.bank_account_number,
    'bank_name', prof.bank_name,
    'account_name', prof.bank_account_name
  )) RETURNING id INTO pid;

  -- Notify admins
  INSERT INTO public.notifications(user_id, title, message, type)
  SELECT p.id, 'New Partner Payout Request',
    COALESCE(prof.full_name,'A partner') || ' requested ₦' || to_char(_amount,'FM999,999,999') || ' payout.',
    'info'
  FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin';

  PERFORM public.send_telegram(
    '🤝 <b>Partner Payout Request</b>' || E'\n'
    || 'Partner: <b>' || COALESCE(prof.full_name,'Unknown') || '</b>' || E'\n'
    || 'Amount: ₦' || to_char(_amount,'FM999,999,999') || E'\n'
    || '👉 <a href="https://app.fundedng.com/admin">Approve in Admin Panel</a>'
  );

  RETURN pid;
END;
$$;

-- 12) Trigger on orders paid: create partner referral + commission
CREATE OR REPLACE FUNCTION public.handle_paid_order_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pid uuid;
  pp RECORD;
  commission_naira bigint;
BEGIN
  IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  SELECT partner_referred_by INTO pid FROM public.profiles WHERE id = NEW.user_id;
  IF pid IS NULL OR pid = NEW.user_id THEN RETURN NEW; END IF;

  SELECT * INTO pp FROM public.partner_profiles WHERE user_id = pid AND is_active = true;
  IF pp IS NULL THEN RETURN NEW; END IF;

  -- amount_paid is in kobo
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

DROP TRIGGER IF EXISTS orders_partner_commission ON public.orders;
CREATE TRIGGER orders_partner_commission
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_paid_order_partner();

-- 13) Partner payout status changes: notifications + balance update
CREATE OR REPLACE FUNCTION public.handle_partner_payout_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      NEW.approved_at := COALESCE(NEW.approved_at, now());
      INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (NEW.partner_id, '✅ Partner Payout Approved',
        'Your partner payout of ₦' || to_char(NEW.amount_naira,'FM999,999,999') || ' has been approved. Processing soon.', 'success');
    ELSIF NEW.status = 'paid' THEN
      NEW.processed_at := COALESCE(NEW.processed_at, now());
      UPDATE public.partner_profiles
        SET total_paid_naira = total_paid_naira + NEW.amount_naira, updated_at = now()
        WHERE user_id = NEW.partner_id;
      INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (NEW.partner_id, '💸 Partner Payout Sent',
        '₦' || to_char(NEW.amount_naira,'FM999,999,999') || ' has been paid to your bank.', 'success');
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications(user_id,title,message,type)
      VALUES (NEW.partner_id, 'Partner Payout Rejected',
        COALESCE('Reason: '||NEW.admin_note,'Your payout request was rejected.'), 'error');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_payouts_status ON public.partner_payouts;
CREATE TRIGGER partner_payouts_status
BEFORE UPDATE ON public.partner_payouts
FOR EACH ROW EXECUTE FUNCTION public.handle_partner_payout_status();
