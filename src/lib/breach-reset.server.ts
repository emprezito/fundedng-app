import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { claimPoolAccount } from "@/lib/account-pool.server";
import { sendEventEmail } from "@/lib/email.server";
import { sendPushToUser } from "@/lib/push.server";

/**
 * Breach Reset — shared logic for both the payment-quote (initialize) and the
 * paid-order delivery (verify) paths.
 *
 * Rules:
 *   - Phase 1 breach  -> no reset (trader must buy a fresh challenge).
 *   - Phase 2 breach  -> reset fee = 30% of the challenge price; new Phase 2
 *                        account provisioned from the phase-2 pool (same size).
 *   - Funded breach   -> reset fee = 60% of the account size (starting_balance);
 *                        new Funded account provisioned from the funded pool at
 *                        the SAME tier and size.
 *   - Each account can be reset at most once (reset_used flag).
 *
 * The amount returned is in the ACCOUNT's currency (NGN or USD) for display;
 * the naira fee used for Squad checkout is derived from it.
 */

export const RESET_FUNDED_PERCENT = 0.6; // 60% of account size
export const RESET_PHASE2_PERCENT = 0.3; // 30% of challenge price

export type ResetKind = "phase2" | "funded";

/**
 * Compute the reset eligibility + fee for a breached account.
 * Returns the kind, the fee in the account currency, and derived helpers.
 */
export async function computeBreachReset(accountId: string) {
  const { data: account, error } = await supabaseAdmin
    .from("trader_accounts")
    .select(`
      id, user_id, mt5_login, currency, starting_balance, current_phase,
      funded_tier, challenge_id, status, reset_used
    `)
    .eq("id", accountId)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!account) return { ok: false as const, error: "Account not found" };
  if (account.status !== "breached") {
    return { ok: false as const, error: "Only breached accounts can be reset" };
  }
  if (account.reset_used) {
    return { ok: false as const, error: "This account has already been reset once." };
  }

  const phase = Number(account.current_phase);
  const currency = account.currency ?? "NGN";
  const isUsd = currency === "USD";
  const startingBalance = Number(account.starting_balance ?? 0);

  let kind: ResetKind | null = null;
  let feeInCurrency: number;

  if (phase <= 1) {
    // Phase 1 breach: no reset — must buy a fresh challenge.
    return { ok: false as const, error: "Phase 1 accounts cannot be reset. Please purchase a new challenge." };
  } else if (phase === 2) {
    kind = "phase2";
    const { data: challenge } = await supabaseAdmin
      .from("challenges")
      .select("price_naira, usd_price")
      .eq("id", account.challenge_id)
      .maybeSingle();
    const base = isUsd ? Number(challenge?.usd_price ?? 0) : Number(challenge?.price_naira ?? 0);
    feeInCurrency = Math.round(base * RESET_PHASE2_PERCENT * 100) / 100;
  } else {
    kind = "funded";
    feeInCurrency = Math.round(startingBalance * RESET_FUNDED_PERCENT * 100) / 100;
  }

  return {
    ok: true as const,
    account,
    kind,
    currency,
    isUsd,
    startingBalance,
    phase,
    fundedTier: Number(account.funded_tier ?? 1),
    feeInCurrency,
  };
}

/**
 * Provision the reset: close the old (breached) account, mark it reset_used,
 * and claim a fresh account of the same size/phase (and funded tier) from the
 * pool, linked to the paid reset order.
 */
export async function provisionBreachReset(args: {
  orderId: string;
  accountId: string;
  userId: string;
}): Promise<{ ok: true; mt5Login: string } | { ok: false; error: string }> {
  const quote = await computeBreachReset(args.accountId);
  if (!quote.ok) return quote;
  if (!quote.kind) return { ok: false, error: "Account is not eligible for a reset" };

  const account = quote.account;
  const phase = quote.kind === "funded" ? 3 : 2;
  const fundedTier = quote.kind === "funded" ? quote.fundedTier : undefined;

  // 1. Close the old breached account + mark reset_used (one reset per account).
  await supabaseAdmin
    .from("trader_accounts")
    .update({ status: "closed", reset_used: true } as never)
    .eq("id", account.id);

  // 2. Claim a fresh account from the pool at the exact size / phase / tier.
  const poolResult = await claimPoolAccount({
    orderId: args.orderId,
    accountSizeNgn: quote.isUsd ? 0 : quote.startingBalance,
    accountSizeUsd: quote.isUsd ? quote.startingBalance : undefined,
    currency: quote.currency,
    challengeId: account.challenge_id,
    userId: args.userId,
    phase,
    fundedTier,
    phaseProgression: false, // real paid reset order
  });

  if (!poolResult.ok) {
    // Rollback: restore the breached account.
    await supabaseAdmin
      .from("trader_accounts")
      .update({ status: "breached", reset_used: false } as never)
      .eq("id", account.id);
    return { ok: false, error: "Pool empty — no account available for reset. Admin has been notified." };
  }

  // 3. Set phase + funded tier on the new account (fallback to pool defaults).
  await supabaseAdmin
    .from("trader_accounts")
    .update({
      current_phase: phase,
      ...(quote.kind === "funded" ? { funded_tier: fundedTier } : {}),
    } as never)
    .eq("id", poolResult.accountId);

  // 4. Notify the trader.
  const label = quote.kind === "funded" ? `Funded ${quote.fundedTier}` : "Phase 2";
  await supabaseAdmin.from("notifications").insert({
    user_id: args.userId,
    title: "🔄 Account Reset Complete",
    message: `Your account has been reset to ${label}. New MT5 Login: ${poolResult.mt5Login} · Server: ${poolResult.mt5Server}. Check your dashboard for the password.`,
    type: "success",
  } as never);

  await sendPushToUser(args.userId, {
    title: "🔄 Account Reset Complete",
    body: "Your new MT5 account is ready.",
    url: "/dashboard",
  }).catch(() => {});

  return { ok: true, mt5Login: poolResult.mt5Login };
}
