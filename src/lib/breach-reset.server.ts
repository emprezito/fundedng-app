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
 *   - Phase 1 breach  -> reset fee = 20% of the challenge price; new Phase 1
 *                        account provisioned from the phase-1 pool (status
 *                        "active" — claimPoolAccount's default).
 *   - Phase 2 breach  -> reset fee = 30% of the challenge price; new Phase 2
 *                        account provisioned from the phase-2 pool (same size).
 *   - Funded breach   -> reset fee = 60% of the challenge price; new Funded
 *                        account provisioned from the funded pool at the SAME
 *                        tier and size.
 *   - Each account can be reset at most once (reset_used flag).
 *
 * Standing eligibility (enforced when NO reset campaign is active):
 *   - account provisioned on/after RESET_ELIGIBLE_FROM
 *   - reset_used = FALSE
 * While a reset campaign is active (now() between start_at/end_at) BOTH
 * standing checks are skipped at reset-request time — the campaign only
 * overrides the check, never the flag, so a reset performed during a campaign
 * still sets reset_used on the new account and is restricted again afterwards.
 *
 * The amount returned is in the ACCOUNT's currency (NGN or USD) for display;
 * the naira fee used for Squad checkout is derived from it.
 */

export const RESET_PHASE1_PERCENT = 0.2; // 20% of challenge price
export const RESET_PHASE2_PERCENT = 0.3; // 30% of challenge price
export const RESET_FUNDED_PERCENT = 0.6; // 60% of challenge price

export type ResetKind = "phase1" | "phase2" | "funded";

// Reset eligibility cutoff. Only accounts provisioned on/after this date
// (hardcoded per product decision) are eligible for the paid reset — unless a
// reset campaign is active, in which case this cutoff is ignored.
const RESET_ELIGIBLE_FROM = new Date("2026-09-01T00:00:00.000Z").getTime();

/**
 * Return the currently active reset campaign (if any) — a row whose window
 * contains now(). There may be zero or one active campaign; "none found"
 * means no campaign is active. RLS allows public reads, so server calls with
 * supabaseAdmin bypass RLS anyway.
 */
export async function getActiveResetCampaign(): Promise<{ id: string; name: string; start_at: string; end_at: string } | null> {
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("reset_campaigns")
    .select("id, name, start_at, end_at")
    .lte("start_at", now)
    .gte("end_at", now)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Compute the reset eligibility + fee for a breached account.
 * Returns the kind, the fee in the account currency, and derived helpers.
 */
export async function computeBreachReset(accountId: string) {
  const { data: account, error } = await supabaseAdmin
    .from("trader_accounts")
    .select(`
      id, user_id, mt5_login, currency, starting_balance, current_phase,
      funded_tier, challenge_id, status, reset_used, created_at
    `)
    .eq("id", accountId)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!account) return { ok: false as const, error: "Account not found" };
  if (account.status !== "breached") {
    return { ok: false as const, error: "Only breached accounts can be reset" };
  }

  const campaign = await getActiveResetCampaign();
  const campaignActive = !!campaign;

  // Standing checks — skipped entirely while a campaign is active.
  if (!campaignActive) {
    if (account.reset_used) {
      return { ok: false as const, error: "This account has already been reset once." };
    }
    const createdAt = account.created_at ? new Date(account.created_at).getTime() : NaN;
    if (!createdAt || Number.isNaN(createdAt) || createdAt < RESET_ELIGIBLE_FROM) {
      return {
        ok: false as const,
        error: "This account is not yet eligible for a reset. Resets are available for accounts provisioned on or after 1 Sep 2026. Please contact support if you believe this is a mistake.",
      };
    }
  }

  const phase = Number(account.current_phase);
  const currency = account.currency ?? "NGN";
  const isUsd = currency === "USD";
  const startingBalance = Number(account.starting_balance ?? 0);

  // Phase 1 (20%), Phase 2 (30%) and Funded (60%) reset fees are all a
  // fraction of the challenge price — NEVER the account size.
  const { data: challenge } = await supabaseAdmin
    .from("challenges")
    .select("price_naira, usd_price")
    .eq("id", account.challenge_id)
    .maybeSingle();
  const base = isUsd ? Number(challenge?.usd_price ?? 0) : Number(challenge?.price_naira ?? 0);
  const kind: ResetKind = phase <= 1 ? "phase1" : phase === 2 ? "phase2" : "funded";
  const percent = kind === "phase1" ? RESET_PHASE1_PERCENT : kind === "phase2" ? RESET_PHASE2_PERCENT : RESET_FUNDED_PERCENT;
  const feeInCurrency = Math.round(base * percent * 100) / 100;

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
    campaignActive,
    campaignEndAt: campaign?.end_at ?? null,
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
}): Promise<{ ok: true; mt5Login: string; mt5Server: string } | { ok: false; error: string }> {
  const quote = await computeBreachReset(args.accountId);
  if (!quote.ok) return quote;
  if (!quote.kind) return { ok: false, error: "Account is not eligible for a reset" };

  const account = quote.account;
  const phase = quote.kind === "funded" ? 3 : quote.kind === "phase2" ? 2 : 1;
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

  // 3. Set phase + funded status/tier on the new account (funded branch only).
  //    Phase-1 and phase-2 resets stay at status: "active" (claimPoolAccount's
  //    default) with the correct current_phase — no override needed.
  //    reset_used: true marks the lifetime reset as consumed on the NEW account
  //    too, so if it breaches again after a campaign ends it is subject to the
  //    standing one-lifetime-reset rule. The campaign only overrides the rule
  //    at reset REQUEST time, never the flag itself.
  await supabaseAdmin
    .from("trader_accounts")
    .update({
      current_phase: phase,
      reset_used: true,
      ...(quote.kind === "funded"
        ? { status: "funded", trading_days: 0, funded_tier: fundedTier }
        : {}),
    } as never)
    .eq("id", poolResult.accountId);

  // 4. Notify the trader.
  const label = quote.kind === "funded" ? `Funded ${quote.fundedTier}` : quote.kind === "phase2" ? "Phase 2" : "Phase 1";
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

  return { ok: true, mt5Login: poolResult.mt5Login, mt5Server: poolResult.mt5Server };
}
