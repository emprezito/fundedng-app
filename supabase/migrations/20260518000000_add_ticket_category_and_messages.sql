-- Add category column to existing tickets table
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE public.tickets ALTER COLUMN category DROP DEFAULT;

-- Ticket messages table for threaded replies
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'trader' CHECK (sender_role IN ('trader', 'admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- RLS: traders can view messages on their own tickets; admins can view all
CREATE POLICY "Users view own ticket messages" ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    ticket_id IN (SELECT id FROM public.tickets WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- RLS: traders can add messages to their own tickets
CREATE POLICY "Users insert own ticket messages" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    ticket_id IN (SELECT id FROM public.tickets WHERE user_id = auth.uid())
    AND sender_id = auth.uid()
    AND sender_role = 'trader'
  );

-- RLS: admins can insert messages on any ticket
CREATE POLICY "Admins insert ticket messages" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND sender_role = 'admin'
  );

-- Index for efficient message loading per ticket
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id, created_at);

-- Update existing tickets RLS to allow admins to update status (not just admin role)
DROP POLICY IF EXISTS "Admins update tickets" ON public.tickets;
CREATE POLICY "Admins update tickets" ON public.tickets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow traders to update their own tickets (e.g. for adding more context)
CREATE POLICY "Traders update own tickets" ON public.tickets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
