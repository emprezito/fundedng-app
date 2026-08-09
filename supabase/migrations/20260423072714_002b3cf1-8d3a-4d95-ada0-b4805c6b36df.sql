CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ch RECORD;
  order_id uuid;
  account_id uuid;
  starting bigint;
  equity numeric;
  i int;
  drift numeric;
  accounts_created int := 0;
  status_choice account_status;
  phase_choice int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Wipe any prior demo data for this user (safe re-run)
  DELETE FROM public.account_snapshots WHERE trader_account_id IN (
    SELECT id FROM public.trader_accounts WHERE user_id = uid
  );
  DELETE FROM public.payouts WHERE user_id = uid;
  DELETE FROM public.trader_accounts WHERE user_id = uid;
  DELETE FROM public.orders WHERE user_id = uid;

  FOR ch IN SELECT * FROM public.challenges WHERE is_active = true ORDER BY account_size LOOP
    starting := ch.account_size;

    -- Order
    INSERT INTO public.orders (user_id, challenge_id, amount_paid, status, paystack_reference)
    VALUES (uid, ch.id, ch.price_naira, 'paid', 'DEMO-' || substr(md5(random()::text), 1, 10))
    RETURNING id INTO order_id;

    -- Pick a status mix: Starter=funded, Growth=passed phase 2, Elite=active phase 1
    IF accounts_created = 0 THEN
      status_choice := 'funded'; phase_choice := 2;
    ELSIF accounts_created = 1 THEN
      status_choice := 'passed'; phase_choice := 2;
    ELSE
      status_choice := 'active'; phase_choice := 1;
    END IF;

    -- Trader account
    INSERT INTO public.trader_accounts (
      user_id, order_id, challenge_id, mt5_login, mt5_password, mt5_server,
      starting_balance, current_equity, current_phase, status,
      phase1_passed_at, phase2_passed_at, funded_at
    ) VALUES (
      uid, order_id, ch.id,
      'DEMO' || lpad(floor(random()*900000+100000)::text, 6, '0'),
      substr(md5(random()::text), 1, 10),
      'Exness-MT5Demo',
      starting,
      starting,
      phase_choice,
      status_choice,
      CASE WHEN status_choice IN ('passed','funded') THEN now() - interval '20 days' ELSE NULL END,
      CASE WHEN status_choice IN ('passed','funded') THEN now() - interval '10 days' ELSE NULL END,
      CASE WHEN status_choice = 'funded' THEN now() - interval '10 days' ELSE NULL END
    ) RETURNING id INTO account_id;

    -- 30 days of equity snapshots with realistic drift
    equity := starting;
    FOR i IN 0..29 LOOP
      -- random walk: avg +0.4% per day with noise
      drift := (random() - 0.35) * 0.018;
      equity := round(equity * (1 + drift));
      IF equity < starting * 0.85 THEN equity := starting * 0.9; END IF;

      INSERT INTO public.account_snapshots (
        trader_account_id, equity, balance, profit, drawdown_percent, snapshot_time
      ) VALUES (
        account_id,
        equity,
        equity - round((random() * 5000)::numeric),
        equity - starting,
        GREATEST(0, round(((starting - equity) / starting * 100)::numeric, 2)),
        now() - ((29 - i) || ' days')::interval
      );
    END LOOP;

    -- Update current equity to last snapshot
    UPDATE public.trader_accounts SET current_equity = equity WHERE id = account_id;

    -- Payouts only for funded/passed accounts
    IF status_choice IN ('funded', 'passed') THEN
      INSERT INTO public.payouts (
        user_id, trader_account_id, amount_naira, profit_percent,
        payment_method, bank_details, status, processed_at, created_at
      ) VALUES (
        uid, account_id,
        round((equity - starting) * 0.4), 6.5,
        'bank_transfer', '{"account":"0123456789","bank":"GTBank"}'::jsonb,
        'paid', now() - interval '5 days', now() - interval '7 days'
      );
      INSERT INTO public.payouts (
        user_id, trader_account_id, amount_naira, profit_percent,
        payment_method, wallet_address, status, created_at
      ) VALUES (
        uid, account_id,
        round((equity - starting) * 0.3), 4.2,
        'usdt', 'TRX-DEMO-WALLET-' || substr(md5(random()::text), 1, 8),
        'pending', now() - interval '1 day'
      );
    END IF;

    accounts_created := accounts_created + 1;
  END LOOP;

  -- Mark KYC verified so user can request payouts
  UPDATE public.profiles SET kyc_verified = true WHERE id = uid;

  RETURN jsonb_build_object('accounts', accounts_created, 'ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_data() FROM public;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO authenticated;