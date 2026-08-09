-- Fix: cast enum to text for upper()
CREATE OR REPLACE FUNCTION public.tg_telegram_on_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE prof_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO prof_name FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.send_telegram(
      '💸 <b>Payout Request</b>' || E'\n'
      || 'Trader: <b>' || COALESCE(prof_name, 'Unknown') || '</b>' || E'\n'
      || 'Amount: ₦' || to_char(NEW.amount_naira, 'FM999,999,999') || E'\n'
      || 'Method: ' || NEW.payment_method::text || E'\n'
      || '👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT full_name INTO prof_name FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.send_telegram(
      '📋 <b>Payout Status: ' || upper(NEW.status::text) || '</b>' || E'\n'
      || 'Trader: ' || COALESCE(prof_name, 'Unknown') || E'\n'
      || 'Amount: ₦' || to_char(NEW.amount_naira, 'FM999,999,999')
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Telegram for affiliate payout requests (was missing entirely)
CREATE OR REPLACE FUNCTION public.tg_telegram_on_affiliate_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE prof_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO prof_name FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.send_telegram(
      '💵 <b>Affiliate Payout Request</b>' || E'\n'
      || 'Affiliate: <b>' || COALESCE(prof_name, 'Unknown') || '</b>' || E'\n'
      || 'Amount: ₦' || to_char(NEW.amount_naira, 'FM999,999,999') || E'\n'
      || '👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT full_name INTO prof_name FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.send_telegram(
      '📋 <b>Affiliate Payout: ' || upper(NEW.status::text) || '</b>' || E'\n'
      || 'Affiliate: ' || COALESCE(prof_name, 'Unknown') || E'\n'
      || 'Amount: ₦' || to_char(NEW.amount_naira, 'FM999,999,999')
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS affiliate_payouts_telegram ON public.affiliate_payouts;
CREATE TRIGGER affiliate_payouts_telegram
  AFTER INSERT OR UPDATE OF status ON public.affiliate_payouts
  FOR EACH ROW EXECUTE FUNCTION public.tg_telegram_on_affiliate_payout();

-- Telegram for phase 2 + funded approval requests
CREATE OR REPLACE FUNCTION public.tg_telegram_on_account_approval_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE prof_name text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.phase2_requested_at IS NULL AND NEW.phase2_requested_at IS NOT NULL THEN
      SELECT full_name INTO prof_name FROM public.profiles WHERE id = NEW.user_id;
      PERFORM public.send_telegram(
        '🎯 <b>Phase 2 Approval Request</b>' || E'\n'
        || 'Trader: <b>' || COALESCE(prof_name, 'Unknown') || '</b>' || E'\n'
        || 'MT5 Login: ' || NEW.mt5_login || E'\n'
        || '👉 <a href="https://app.fundedng.com/admin">Approve in Admin Panel</a>'
      );
    END IF;
    IF OLD.funded_requested_at IS NULL AND NEW.funded_requested_at IS NOT NULL THEN
      SELECT full_name INTO prof_name FROM public.profiles WHERE id = NEW.user_id;
      PERFORM public.send_telegram(
        '🏆 <b>Funded Approval Request</b>' || E'\n'
        || 'Trader: <b>' || COALESCE(prof_name, 'Unknown') || '</b>' || E'\n'
        || 'MT5 Login: ' || NEW.mt5_login || E'\n'
        || '👉 <a href="https://app.fundedng.com/admin">Approve in Admin Panel</a>'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trader_accounts_approval_telegram ON public.trader_accounts;
CREATE TRIGGER trader_accounts_approval_telegram
  AFTER UPDATE ON public.trader_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_telegram_on_account_approval_request();