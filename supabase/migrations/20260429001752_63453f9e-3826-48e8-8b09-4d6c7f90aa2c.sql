CREATE OR REPLACE FUNCTION public.send_telegram(p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  bot_token text;
  chat_id   text;
BEGIN
  SELECT value INTO bot_token FROM public.app_config WHERE key = 'telegram_bot_token';
  SELECT value INTO chat_id   FROM public.app_config WHERE key = 'telegram_chat_id';
  IF bot_token IS NULL OR bot_token = '' OR chat_id IS NULL OR chat_id = '' THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'chat_id',    chat_id,
      'text',       p_message,
      'parse_mode', 'HTML'
    ),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[send_telegram] failed: %', SQLERRM;
END;
$function$;

SELECT public.send_telegram('🧪 Test message from FundedNG — Telegram is now wired up correctly!');