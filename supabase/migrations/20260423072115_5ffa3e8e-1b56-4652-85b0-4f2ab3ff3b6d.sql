-- Allow inserting notifications for self (used by app for in-app messages)
CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Admin self-bootstrap: allow any authenticated user to claim admin if no admin exists yet.
CREATE OR REPLACE FUNCTION public.claim_admin_if_unclaimed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_admin;
  IF has_admin THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_admin_if_unclaimed() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_admin_if_unclaimed() TO authenticated;