-- Allow 'positions' violations (position stacking / averaging down) in the
-- violation-dedup table alongside scalping, news, and weekend types.

ALTER TABLE public.processed_violations
  DROP CONSTRAINT IF EXISTS processed_violations_violation_type_check;

ALTER TABLE public.processed_violations
  ADD CONSTRAINT processed_violations_violation_type_check
  CHECK (violation_type IN ('scalping', 'news', 'weekend', 'positions'));
