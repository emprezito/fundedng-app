-- Set Telegram bot credentials in app_config
INSERT INTO public.app_config (key, value) VALUES
  ('telegram_bot_token', '8502988815:AAF8_YvWsVZbu8MjFzBGrsmQ7EVak5B2PSI'),
  ('telegram_chat_id', '-1003991560803')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
