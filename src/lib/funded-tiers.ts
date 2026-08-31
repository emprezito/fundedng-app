/**
 * Funded tier logic shared by client + server.
 *
 * A trader starts at Funded 1 the moment they are funded. Each payout that is
 * marked "paid" closes the old account and provisions a NEW account at the next
 * tier via the pool. The tier therefore equals the number of paid payouts on the
 * current chain plus one.
 */

/** Max withdrawal percent allowed for a given funded tier. */
export function maxWithdrawalPercentForTier(tier: number): number {
  if (tier <= 1) return 10; // Funded 1
  if (tier === 2) return 50; // Funded 2
  if (tier === 3) return 50; // Funded 3
  return 100; // Funded 4+
}

/** Human label e.g. "Funded 1", "Funded 2". */
export function fundedTierLabel(tier: number): string {
  return `Funded ${Math.max(1, tier)}`;
}

/**
 * Given the number of prior paid/approved payouts a trader has accumulated,
 * return the tier of the NEXT account to provision after this payout.
 * The first payout happens on Funded 1 -> new account is Funded 2.
 */
export function nextFundedTierForPayout(payoutNumber: number): number {
  // payoutNumber is 1-based (the payout currently being processed).
  // Current account tier = payoutNumber (Funded 1 = first payout).
  // New account after this payout = payoutNumber + 1.
  return payoutNumber + 1;
}

/**
 * Tier of the CURRENT account given how many paid/approved payouts have already
 * occurred on it. A freshly-funded account with 0 prior payouts is Funded 1.
 */
export function fundedTierFromPriorPayouts(priorCount: number): number {
  return priorCount + 1;
}
