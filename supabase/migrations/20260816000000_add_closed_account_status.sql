-- Add 'closed' status for accounts that have been superseded by a new account after payout
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'closed' AFTER 'funded';
