-- 1) Prevent duplicate group memberships (fixes silent join failures on re-click)
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_group_user_unique UNIQUE (group_id, user_id);

-- 2) Certificates table
CREATE TYPE public.certificate_kind AS ENUM ('funded', 'payout');

CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trader_account_id uuid NOT NULL,
  payout_id uuid,
  kind public.certificate_kind NOT NULL,
  certificate_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  account_size bigint NOT NULL,
  challenge_name text NOT NULL,
  mt5_login text NOT NULL,
  payout_amount bigint,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_certificates_user ON public.certificates(user_id, issued_at DESC);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own certificates"
  ON public.certificates FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage certificates"
  ON public.certificates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Trigger: auto-issue 'funded' cert when trader_accounts.status becomes 'funded'
CREATE OR REPLACE FUNCTION public.issue_funded_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prof RECORD;
  ch RECORD;
  cert_no text;
BEGIN
  IF NEW.status = 'funded' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'funded') THEN
    -- Avoid duplicates per account
    IF EXISTS (SELECT 1 FROM public.certificates WHERE trader_account_id = NEW.id AND kind = 'funded') THEN
      RETURN NEW;
    END IF;
    SELECT full_name INTO prof FROM public.profiles WHERE id = NEW.user_id;
    SELECT name INTO ch FROM public.challenges WHERE id = NEW.challenge_id;
    cert_no := 'FNG-FND-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(NEW.id::text,'-',''),1,6));
    INSERT INTO public.certificates(
      user_id, trader_account_id, kind, certificate_number,
      full_name, account_size, challenge_name, mt5_login
    ) VALUES (
      NEW.user_id, NEW.id, 'funded', cert_no,
      COALESCE(prof.full_name, 'FundedNG Trader'),
      NEW.starting_balance,
      COALESCE(ch.name, 'Challenge'),
      NEW.mt5_login
    );
    INSERT INTO public.notifications(user_id, title, message, type)
    VALUES (NEW.user_id, 'Funded Certificate Issued', 'Congratulations! Your funded trader certificate is ready.', 'success');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_issue_funded_certificate
AFTER INSERT OR UPDATE OF status ON public.trader_accounts
FOR EACH ROW EXECUTE FUNCTION public.issue_funded_certificate();

-- 4) Trigger: auto-issue 'payout' cert when payouts.status becomes 'paid'
CREATE OR REPLACE FUNCTION public.issue_payout_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prof RECORD;
  acct RECORD;
  ch RECORD;
  cert_no text;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    IF EXISTS (SELECT 1 FROM public.certificates WHERE payout_id = NEW.id) THEN
      RETURN NEW;
    END IF;
    SELECT full_name INTO prof FROM public.profiles WHERE id = NEW.user_id;
    SELECT * INTO acct FROM public.trader_accounts WHERE id = NEW.trader_account_id;
    SELECT name INTO ch FROM public.challenges WHERE id = acct.challenge_id;
    cert_no := 'FNG-PAY-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(NEW.id::text,'-',''),1,6));
    INSERT INTO public.certificates(
      user_id, trader_account_id, payout_id, kind, certificate_number,
      full_name, account_size, challenge_name, mt5_login, payout_amount, issued_at
    ) VALUES (
      NEW.user_id, NEW.trader_account_id, NEW.id, 'payout', cert_no,
      COALESCE(prof.full_name, 'FundedNG Trader'),
      acct.starting_balance,
      COALESCE(ch.name, 'Challenge'),
      acct.mt5_login,
      NEW.amount_naira,
      COALESCE(NEW.processed_at, now())
    );
    INSERT INTO public.notifications(user_id, title, message, type)
    VALUES (NEW.user_id, 'Payout Certificate Issued', 'Your payout certificate is now available.', 'success');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_issue_payout_certificate
AFTER INSERT OR UPDATE OF status ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.issue_payout_certificate();

-- 5) Backfill certificates for existing funded accounts and paid payouts
INSERT INTO public.certificates (
  user_id, trader_account_id, kind, certificate_number,
  full_name, account_size, challenge_name, mt5_login
)
SELECT
  ta.user_id, ta.id, 'funded',
  'FNG-FND-' || to_char(COALESCE(ta.funded_at, now()),'YYYYMMDD') || '-' || upper(substr(replace(ta.id::text,'-',''),1,6)),
  COALESCE(p.full_name, 'FundedNG Trader'),
  ta.starting_balance,
  COALESCE(c.name, 'Challenge'),
  ta.mt5_login
FROM public.trader_accounts ta
LEFT JOIN public.profiles p ON p.id = ta.user_id
LEFT JOIN public.challenges c ON c.id = ta.challenge_id
WHERE ta.status = 'funded'
ON CONFLICT (certificate_number) DO NOTHING;

INSERT INTO public.certificates (
  user_id, trader_account_id, payout_id, kind, certificate_number,
  full_name, account_size, challenge_name, mt5_login, payout_amount, issued_at
)
SELECT
  po.user_id, po.trader_account_id, po.id, 'payout',
  'FNG-PAY-' || to_char(COALESCE(po.processed_at, po.created_at),'YYYYMMDD') || '-' || upper(substr(replace(po.id::text,'-',''),1,6)),
  COALESCE(p.full_name, 'FundedNG Trader'),
  ta.starting_balance,
  COALESCE(c.name, 'Challenge'),
  ta.mt5_login,
  po.amount_naira,
  COALESCE(po.processed_at, po.created_at)
FROM public.payouts po
JOIN public.trader_accounts ta ON ta.id = po.trader_account_id
LEFT JOIN public.profiles p ON p.id = po.user_id
LEFT JOIN public.challenges c ON c.id = ta.challenge_id
WHERE po.status = 'paid'
ON CONFLICT (certificate_number) DO NOTHING;