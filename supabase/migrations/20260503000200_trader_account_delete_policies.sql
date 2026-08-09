-- Add RLS policies for deleting trader_accounts
-- Admins can hard-delete any account
CREATE POLICY "Admins delete accounts" ON public.trader_accounts
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Traders can permanently delete their own breached accounts that have been soft-deleted
CREATE POLICY "Traders delete own breached accounts" ON public.trader_accounts
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    AND status = 'breached'
    AND deleted_at IS NOT NULL
  );
