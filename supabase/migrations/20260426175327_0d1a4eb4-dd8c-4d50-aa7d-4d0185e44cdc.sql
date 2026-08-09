-- 1. Enable pg_net for outbound HTTP
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Internal config table for webhook URL + shared secret
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage app_config" ON public.app_config;
CREATE POLICY "Admins manage app_config"
ON public.app_config
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Seed webhook URL + auto-generated secret (idempotent)
INSERT INTO public.app_config (key, value)
VALUES (
  'push_webhook_url',
  'https://project--32d51fa4-0ae5-4f6a-96a0-1e0f70b63085.lovable.app/api/public/push-event'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_config (key, value)
VALUES (
  'push_webhook_secret',
  'fng_push_' || encode(gen_random_bytes(24), 'hex')
)
ON CONFLICT (key) DO NOTHING;

-- 4. Helper that posts a push event to the app webhook
CREATE OR REPLACE FUNCTION public.notify_push_event(
  _event text,
  _user_id uuid,
  _title text,
  _body text,
  _url text DEFAULT '/dashboard',
  _admins boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  webhook_url text;
  webhook_secret text;
BEGIN
  SELECT value INTO webhook_url   FROM public.app_config WHERE key = 'push_webhook_url';
  SELECT value INTO webhook_secret FROM public.app_config WHERE key = 'push_webhook_secret';

  IF webhook_url IS NULL OR webhook_url = '' THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', COALESCE(webhook_secret, '')
    ),
    body := jsonb_build_object(
      'event', _event,
      'user_id', _user_id,
      'admins', _admins,
      'title', _title,
      'body', _body,
      'url', _url
    ),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_push_event failed: %', SQLERRM;
END;
$$;

-- 5. Trigger: payouts status changes -> push to trader
CREATE OR REPLACE FUNCTION public.tg_payouts_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.notify_push_event(
        'payout_approved',
        NEW.user_id,
        '✅ Payout Approved',
        'Your payout of ₦' || to_char(NEW.amount_naira, 'FM999,999,999') || ' is approved and on the way.',
        '/dashboard'
      );
    ELSIF NEW.status = 'paid' THEN
      PERFORM public.notify_push_event(
        'payout_paid',
        NEW.user_id,
        '💸 Payout Sent',
        '₦' || to_char(NEW.amount_naira, 'FM999,999,999') || ' has been paid out. Check your account.',
        '/dashboard'
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_push_event(
        'payout_rejected',
        NEW.user_id,
        'Payout Update',
        'Your payout request needs attention. Open the dashboard for details.',
        '/dashboard'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payouts_push_trigger ON public.payouts;
CREATE TRIGGER payouts_push_trigger
AFTER UPDATE ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.tg_payouts_push();

-- 6. Trigger: trader_accounts phase / funded / breached -> push to trader
CREATE OR REPLACE FUNCTION public.tg_trader_accounts_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.current_phase IS DISTINCT FROM NEW.current_phase
       AND NEW.current_phase = 2 THEN
      PERFORM public.notify_push_event(
        'phase_passed',
        NEW.user_id,
        '🎯 Phase 1 Passed',
        'Great trading. You are now in Phase 2 — keep it steady.',
        '/dashboard'
      );
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'funded' THEN
        PERFORM public.notify_push_event(
          'account_funded',
          NEW.user_id,
          '🏆 You are Funded!',
          'Congratulations — your account is now funded. Trade and request payouts.',
          '/dashboard'
        );
      ELSIF NEW.status = 'breached' THEN
        PERFORM public.notify_push_event(
          'account_breached',
          NEW.user_id,
          '⚠️ Account Breached',
          COALESCE(NEW.breach_reason, 'Drawdown limit hit. Challenge ended.'),
          '/dashboard'
        );
      ELSIF NEW.status = 'passed' THEN
        PERFORM public.notify_push_event(
          'account_passed',
          NEW.user_id,
          '✅ Challenge Passed',
          'You passed the challenge. Funded account is being prepared.',
          '/dashboard'
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trader_accounts_push_trigger ON public.trader_accounts;
CREATE TRIGGER trader_accounts_push_trigger
AFTER UPDATE ON public.trader_accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_trader_accounts_push();