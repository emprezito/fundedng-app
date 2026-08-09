-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('admin', 'trader');
CREATE TYPE public.account_status AS ENUM ('active', 'breached', 'passed', 'funded');
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'delivered', 'manual_pending', 'failed');
CREATE TYPE public.payout_status AS ENUM ('pending', 'approved', 'paid', 'rejected');
CREATE TYPE public.payout_method AS ENUM ('usdt', 'bank_transfer');

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============= ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============= CHALLENGES =============
CREATE TABLE public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_size BIGINT NOT NULL,
  price_naira BIGINT NOT NULL,
  profit_target_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  max_drawdown_percent NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  min_trading_days INT NOT NULL DEFAULT 1,
  phases INT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- ============= ORDERS =============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id),
  paystack_reference TEXT UNIQUE,
  amount_paid BIGINT NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_user ON public.orders(user_id);

-- ============= TRADER ACCOUNTS =============
CREATE TABLE public.trader_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id),
  mt5_login TEXT NOT NULL,
  mt5_password TEXT NOT NULL,
  mt5_server TEXT NOT NULL DEFAULT 'Exness-MT5Demo',
  starting_balance BIGINT NOT NULL,
  current_equity NUMERIC(15,2),
  current_phase INT NOT NULL DEFAULT 1,
  status public.account_status NOT NULL DEFAULT 'active',
  breach_reason TEXT,
  phase1_passed_at TIMESTAMPTZ,
  phase2_passed_at TIMESTAMPTZ,
  funded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.trader_accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_trader_accounts_user ON public.trader_accounts(user_id);

-- ============= ACCOUNT SNAPSHOTS =============
CREATE TABLE public.account_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_account_id UUID NOT NULL REFERENCES public.trader_accounts(id) ON DELETE CASCADE,
  equity NUMERIC(15,2) NOT NULL,
  balance NUMERIC(15,2) NOT NULL,
  profit NUMERIC(15,2) NOT NULL DEFAULT 0,
  drawdown_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.account_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_snapshots_account ON public.account_snapshots(trader_account_id, snapshot_time DESC);

-- ============= PAYOUTS =============
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trader_account_id UUID NOT NULL REFERENCES public.trader_accounts(id) ON DELETE CASCADE,
  amount_naira BIGINT NOT NULL,
  profit_percent NUMERIC(8,4),
  payment_method public.payout_method NOT NULL,
  wallet_address TEXT,
  bank_details JSONB,
  status public.payout_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payouts_user ON public.payouts(user_id);

-- ============= NOTIFICATIONS =============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);

-- ============= TIMESTAMP TRIGGER =============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_trader_accounts_updated BEFORE UPDATE ON public.trader_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============= HANDLE NEW USER =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'trader');
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (NEW.id, 'Welcome to FundedNG', 'Your account is ready. Pick a challenge to start trading.', 'welcome');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= RLS POLICIES =============

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- challenges (public read)
CREATE POLICY "Anyone can view active challenges" ON public.challenges
  FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins can manage challenges" ON public.challenges
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- orders
CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all orders" ON public.orders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update orders" ON public.orders
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- trader_accounts
CREATE POLICY "Users view own accounts" ON public.trader_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all accounts" ON public.trader_accounts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert accounts" ON public.trader_accounts
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update accounts" ON public.trader_accounts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- account_snapshots: public read for leaderboard, restricted writes
CREATE POLICY "Anyone can view snapshots" ON public.account_snapshots
  FOR SELECT USING (TRUE);
CREATE POLICY "Admins insert snapshots" ON public.account_snapshots
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- payouts
CREATE POLICY "Users view own payouts" ON public.payouts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own payouts" ON public.payouts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all payouts" ON public.payouts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update payouts" ON public.payouts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- notifications
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all notifications" ON public.notifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============= SEED CHALLENGES =============
INSERT INTO public.challenges (name, account_size, price_naira, profit_target_percent, max_drawdown_percent, min_trading_days, phases) VALUES
  ('Starter', 200000, 12000, 10.00, 20.00, 1, 2),
  ('Growth', 500000, 30000, 10.00, 20.00, 1, 2),
  ('Elite', 1000000, 55000, 10.00, 20.00, 1, 2);
