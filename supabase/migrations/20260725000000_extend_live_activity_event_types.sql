-- Extend live_activity CHECK constraint to support manual admin-logged events
-- Existing: 'payout_paid', 'phase2_approved', 'funded_approved'
-- Added:    'phase1_to_phase2', 'phase2_to_funded', 'payout_approved'

ALTER TABLE public.live_activity DROP CONSTRAINT IF EXISTS live_activity_event_type_check;

ALTER TABLE public.live_activity ADD CONSTRAINT live_activity_event_type_check
  CHECK (event_type IN (
    'payout_paid',
    'phase2_approved',
    'funded_approved',
    'phase1_to_phase2',
    'phase2_to_funded',
    'payout_approved'
  ));

-- Add metadata column for certificate data on manual admin entries
ALTER TABLE public.live_activity ADD COLUMN IF NOT EXISTS metadata jsonb;
