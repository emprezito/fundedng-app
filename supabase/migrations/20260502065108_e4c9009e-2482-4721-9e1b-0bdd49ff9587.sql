CREATE TABLE IF NOT EXISTS public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  percent_off numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  max_redemptions integer,
  redemption_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discount_codes_percent_range CHECK (percent_off >= 0 AND percent_off <= 100)
);

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage discount codes" ON public.discount_codes;
CREATE POLICY "Admins manage discount codes"
ON public.discount_codes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone can view active discount codes" ON public.discount_codes;
CREATE POLICY "Anyone can view active discount codes"
ON public.discount_codes
FOR SELECT
TO public
USING (
  is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
);

CREATE TRIGGER trg_discount_codes_updated_at
BEFORE UPDATE ON public.discount_codes
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS original_amount bigint,
  ADD COLUMN IF NOT EXISTS discount_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_promo_code text;

UPDATE public.orders
SET original_amount = COALESCE(original_amount, amount_paid)
WHERE original_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_discount_code ON public.orders(discount_code);
CREATE INDEX IF NOT EXISTS idx_orders_partner_promo_code ON public.orders(partner_promo_code);

CREATE TABLE IF NOT EXISTS public.partner_free_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  account_size bigint NOT NULL DEFAULT 200000,
  challenge_name text NOT NULL DEFAULT 'Partner Free Challenge',
  mt5_login text,
  mt5_password text,
  investor_password text,
  mt5_server text,
  admin_note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_free_accounts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_free_accounts_once
ON public.partner_free_accounts(partner_id);

DROP POLICY IF EXISTS "Admins manage partner free accounts" ON public.partner_free_accounts;
CREATE POLICY "Admins manage partner free accounts"
ON public.partner_free_accounts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Partners view own free account" ON public.partner_free_accounts;
CREATE POLICY "Partners view own free account"
ON public.partner_free_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = partner_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Partners request own free account" ON public.partner_free_accounts;
CREATE POLICY "Partners request own free account"
ON public.partner_free_accounts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = partner_id);

CREATE TRIGGER trg_partner_free_accounts_updated_at
BEFORE UPDATE ON public.partner_free_accounts
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_discount_code(_code text)
RETURNS TABLE(code text, percent_off numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT dc.code, dc.percent_off
  FROM public.discount_codes dc
  WHERE dc.code = upper(trim(_code))
    AND dc.is_active = true
    AND (dc.expires_at IS NULL OR dc.expires_at > now())
    AND (dc.max_redemptions IS NULL OR dc.redemption_count < dc.max_redemptions)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.claim_partner_free_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  pp RECORD;
  claim_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO pp
  FROM public.partner_profiles
  WHERE user_id = auth.uid() AND is_active = true;
  IF pp IS NULL THEN RAISE EXCEPTION 'No active partner profile'; END IF;

  IF EXISTS (SELECT 1 FROM public.partner_free_accounts WHERE partner_id = auth.uid()) THEN
    RAISE EXCEPTION 'You have already requested your free partnership account';
  END IF;

  INSERT INTO public.partner_free_accounts(partner_id)
  VALUES (auth.uid())
  RETURNING id INTO claim_id;

  INSERT INTO public.notifications(user_id, title, message, type)
  SELECT p.id, 'New Partner Free Account Request',
    COALESCE((SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'A partner') || ' requested their one-time free partnership account.',
    'info'
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin';

  PERFORM public.send_telegram(
    '🤝 <b>Partner Free Account Request</b>' || E'\n'
    || 'Partner: <b>' || COALESCE((SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Unknown') || '</b>' || E'\n'
    || '👉 <a href="https://app.fundedng.com/admin">Deliver in Admin Panel</a>'
  );

  RETURN claim_id;
END;
$$;

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
      '🎉 Your Partnership Account is Ready',
      'Login: ' || NEW.mt5_login
        || ' · Server: ' || COALESCE(NEW.mt5_server, 'See dashboard')
        || '. Check your partner dashboard for full credentials.',
      'success'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_free_account_delivery ON public.partner_free_accounts;
CREATE TRIGGER trg_partner_free_account_delivery
BEFORE UPDATE ON public.partner_free_accounts
FOR EACH ROW
EXECUTE FUNCTION public.tg_partner_free_account_delivery();

CREATE OR REPLACE FUNCTION public.handle_paid_order_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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