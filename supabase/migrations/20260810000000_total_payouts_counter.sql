-- ── TOTAL PAYOUTS COUNTER ───────────────────────────────────────────────────
-- Single source of truth for the public "Total Payouts" figure on /leaderboard.
-- Base value seeded to ₦33,000,000. Every payout that moves to status
-- 'approved' (any admin path: dashboard, admin panel, Telegram) increments it.
-- Manual social-proof payouts logged via addManualActivityServer increment it
-- from server code. The value lives in app_config so it never resets when the
-- live_activity feed is trimmed.

-- 1. Seed base counter (idempotent, sets to exactly 33,000,000 on first run)
INSERT INTO public.app_config (key, value)
VALUES ('total_payouts', '33000000')
ON CONFLICT (key) DO UPDATE
  SET value = '33000000', updated_at = now();

-- 2. Trigger: increment counter whenever a payout transitions to 'approved'
CREATE OR REPLACE FUNCTION public.tg_total_payouts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      UPDATE public.app_config
      SET value = (COALESCE(value::numeric, 0) + NEW.amount_naira::numeric)::text,
          updated_at = now()
      WHERE key = 'total_payouts';
    END IF;
  ELSIF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.app_config
    SET value = (COALESCE(value::numeric, 0) + NEW.amount_naira::numeric)::text,
        updated_at = now()
    WHERE key = 'total_payouts';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS total_payouts_trigger ON public.payouts;
CREATE TRIGGER total_payouts_trigger
  AFTER INSERT OR UPDATE OF status ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.tg_total_payouts();

-- 3. Public read for the leaderboard (only exposes the total, bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_total_payouts()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(value::numeric, 0)
  FROM public.app_config
  WHERE key = 'total_payouts';
$$;

REVOKE ALL ON FUNCTION public.get_total_payouts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_total_payouts() TO anon, authenticated;
