-- Update existing challenge prices
UPDATE public.challenges SET price_naira = 7500  WHERE account_size = 200000;
UPDATE public.challenges SET price_naira = 17500 WHERE account_size = 500000;
UPDATE public.challenges SET price_naira = 32000 WHERE account_size = 1000000;

-- Add Elite tier if it doesn't already exist (matched by account_size)
INSERT INTO public.challenges (name, account_size, price_naira, profit_target_percent, max_drawdown_percent, phases, is_active)
SELECT 'Elite', 2000000, 60000, 10, 20, 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.challenges WHERE account_size = 2000000);

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_push_subscriptions_updated
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);