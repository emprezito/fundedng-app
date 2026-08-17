import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";
import { claimPoolAccount } from "@/lib/account-pool.server";

export const Route = createFileRoute("/api/public/cron/auto-progress-phase")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleAutoProgress(request),
    },
  },
});

async function meetsProgressionCriteria(
  account: any,
  challenge: any,
): Promise<{ passes: boolean; reason?: string }> {
  const isUsd = account.currency === "USD";

  // 1. Trading days check
  const minDays = isUsd ? 5 : (challenge.min_trading_days ?? 3);
  const tradingDays = account.trading_days ?? 0;
  if (tradingDays < minDays) {
    return {
      passes: false,
      reason: `Trading days not met: ${tradingDays} of ${minDays} required`,
    };
  }

  // 2. Scalping warnings — must have fewer than 4 (breach threshold)
  const scalpingWarnings = account.scalping_warnings ?? 0;
  if (scalpingWarnings >= 4) {
    return {
      passes: false,
      reason: `Scalping violations: ${scalpingWarnings}/4 — account should already be breached`,
    };
  }

  // 3. No excessive short-held trades that should have triggered breach
  const phaseStart = account.current_phase >= 2 && account.phase1_passed_at
    ? account.phase1_passed_at
    : account.created_at;

  const { data: shortTrades } = await supabaseAdmin
    .from("closed_trades")
    .select("id")
    .eq("account_id", account.id)
    .lt("duration_seconds", 180)
    .gte("close_time", phaseStart);

  const shortTradeCount = shortTrades?.length ?? 0;
  if (shortTradeCount >= 4) {
    return {
      passes: false,
      reason: `${shortTradeCount} short-held trades detected — breach should have fired`,
    };
  }

  return { passes: true };
}

async function handleAutoProgress(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Find all accounts with phase_progression_pending set
  const { data: pending, error: queryErr } = await supabaseAdmin
    .from("trader_accounts")
    .select("id, user_id, starting_balance, currency, challenge_id, order_id, phase_progression_pending, current_phase, trading_days, scalping_warnings, created_at, phase1_passed_at")
    .not("phase_progression_pending", "is", null)
    .in("status", ["active"]);

  if (queryErr) {
    console.error("[auto-progress] query failed:", queryErr);
    return Response.json({ error: queryErr.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return Response.json({ ok: true, processed: 0, failed: 0 });
  }

  let processed = 0;
  let failed = 0;

  for (const account of pending) {
    try {
      // 2. Optimistic lock — mark as processing to prevent double-provisioning
      const originalPending = account.phase_progression_pending;
      const processingFlag = `processing_${originalPending}`;

      const { data: locked } = await supabaseAdmin
        .from("trader_accounts")
        .update({ phase_progression_pending: processingFlag } as never)
        .eq("id", account.id)
        .eq("phase_progression_pending", originalPending)
        .select("id")
        .single();

      if (!locked) {
        // Another cycle is already processing this account
        continue;
      }

      // 3. Fetch the challenge
      const { data: challenge } = await supabaseAdmin
        .from("challenges")
        .select("min_trading_days, profit_target_percent, phases")
        .eq("id", account.challenge_id)
        .single();

      if (!challenge) {
        console.error(`[auto-progress] Challenge not found for account ${account.id}, rolling back`);
        await supabaseAdmin
          .from("trader_accounts")
          .update({ phase_progression_pending: originalPending } as never)
          .eq("id", account.id);
        continue;
      }

      // 4. Run criteria check
      const { passes, reason } = await meetsProgressionCriteria(account, challenge);

      if (!passes) {
        // Criteria not met — restore pending flag, try again next cycle
        await supabaseAdmin
          .from("trader_accounts")
          .update({ phase_progression_pending: originalPending } as never)
          .eq("id", account.id);

        console.log(`[auto-progress] Account ${account.id} waiting: ${reason}`);

        // Send "Almost There" notification (once per 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", account.user_id)
          .eq("type", "info")
          .ilike("title", "%almost there%")
          .gte("created_at", oneDayAgo);

        if (!count || count === 0) {
          await supabaseAdmin.from("notifications").insert({
            user_id: account.user_id,
            title: "🎯 Almost There — Profit Target Hit!",
            message: `You've hit your profit target! To progress to the next phase, you still need: ${reason}. Keep trading — your account will be upgraded automatically once all requirements are met.`,
            type: "info",
          });
        }

        continue;
      }

      // 5. All criteria met — proceed with provisioning
      const isUsd = account.currency === "USD";
      const startingBalance = Number(account.starting_balance);

      if (originalPending === "phase2") {
        // Mark old account as passed
        const { error: passErr } = await supabaseAdmin
          .from("trader_accounts")
          .update({
            status: "passed",
            phase_progression_pending: null,
            phase1_passed_at: new Date().toISOString(),
          } as never)
          .eq("id", account.id);

        if (passErr) {
          console.error(`[auto-progress] Failed to mark account ${account.id} as passed:`, passErr);
          await supabaseAdmin
            .from("trader_accounts")
            .update({ phase_progression_pending: originalPending } as never)
            .eq("id", account.id);
          failed++;
          continue;
        }

        // Claim fresh account from pool
        const poolResult = await claimPoolAccount({
          orderId: account.order_id,
          accountSizeNgn: isUsd ? 0 : startingBalance,
          accountSizeUsd: isUsd ? startingBalance : undefined,
          currency: account.currency ?? "NGN",
          challengeId: account.challenge_id,
          userId: account.user_id,
          phase: 2,
          phaseProgression: true,
        });

        if (!poolResult.ok) {
          // Rollback — put old account back to active
          await supabaseAdmin
            .from("trader_accounts")
            .update({
              status: "active",
              phase_progression_pending: originalPending,
              phase1_passed_at: null,
            } as never)
            .eq("id", account.id);

          // Notify admin about the failure
          await supabaseAdmin.from("notifications").insert({
            user_id: account.user_id,
            title: "🚨 Auto-Progression Failed — Pool Empty",
            message: `Phase 2 provisioning failed: pool unavailable for ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()} account. Trader is waiting. The system will retry automatically.`,
            type: "error",
          });

          await supabaseAdmin.rpc("send_telegram" as never, {
            p_message: `🚨 <b>Auto-Progression Failed — Pool Empty</b>\nSize: ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()}\nTrader: ${account.user_id}\nThe system will retry automatically.`,
          } as never);

          failed++;
          continue;
        }

        // Set new account to Phase 2
        await supabaseAdmin
          .from("trader_accounts")
          .update({
            current_phase: 2,
            phase1_passed_at: new Date().toISOString(),
            trading_days: 0,
          } as never)
          .eq("id", poolResult.accountId);

        // Notify trader with new credentials
        await supabaseAdmin.from("notifications").insert({
          user_id: account.user_id,
          title: "🎯 Phase 1 Passed — New Account Provisioned",
          message: `Congratulations — you passed Phase 1! Your Phase 2 account is ready. New Login: ${poolResult.mt5Login} · Server: ${poolResult.mt5Server}. Your starting balance is ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()}. Good luck!`,
          type: "success",
        });

        // Email
        await sendEventEmail({ type: "phase1_passed", accountId: poolResult.accountId }).catch((e) =>
          console.error("[auto-progress] phase1_passed email failed:", e),
        );

        // Telegram
        await supabaseAdmin.rpc("send_telegram" as never, {
          p_message: `🎯 <b>Phase 2 Auto-Provisioned</b>\nTrader: ${account.user_id}\nNew Login: ${poolResult.mt5Login}\nServer: ${poolResult.mt5Server}\nSize: ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()}`,
        } as never);

        processed++;

      } else if (originalPending === "funded") {
        // Mark old account as passed
        const { error: passErr } = await supabaseAdmin
          .from("trader_accounts")
          .update({
            status: "passed",
            phase_progression_pending: null,
            phase2_passed_at: new Date().toISOString(),
          } as never)
          .eq("id", account.id);

        if (passErr) {
          console.error(`[auto-progress] Failed to mark account ${account.id} as passed:`, passErr);
          await supabaseAdmin
            .from("trader_accounts")
            .update({ phase_progression_pending: originalPending } as never)
            .eq("id", account.id);
          failed++;
          continue;
        }

        // Claim fresh funded account from pool
        const poolResult = await claimPoolAccount({
          orderId: account.order_id,
          accountSizeNgn: isUsd ? 0 : startingBalance,
          accountSizeUsd: isUsd ? startingBalance : undefined,
          currency: account.currency ?? "NGN",
          challengeId: account.challenge_id,
          userId: account.user_id,
          phase: 3,
          phaseProgression: true,
        });

        if (!poolResult.ok) {
          // Rollback
          await supabaseAdmin
            .from("trader_accounts")
            .update({
              status: "active",
              phase_progression_pending: originalPending,
              phase2_passed_at: null,
            } as never)
            .eq("id", account.id);

          await supabaseAdmin.from("notifications").insert({
            user_id: account.user_id,
            title: "🚨 Auto-Progression Failed — Pool Empty",
            message: `Funded account provisioning failed: pool unavailable for ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()} account. Trader is waiting. The system will retry automatically.`,
            type: "error",
          });

          await supabaseAdmin.rpc("send_telegram" as never, {
            p_message: `🚨 <b>Auto-Progression Failed — Pool Empty (Funded)</b>\nSize: ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()}\nTrader: ${account.user_id}\nThe system will retry automatically.`,
          } as never);

          failed++;
          continue;
        }

        // Set funded status on new account
        await supabaseAdmin
          .from("trader_accounts")
          .update({
            status: "funded",
            current_phase: 3,
            funded_at: new Date().toISOString(),
            trading_days: 0,
          } as never)
          .eq("id", poolResult.accountId);

        // Notify trader
        await supabaseAdmin.from("notifications").insert({
          user_id: account.user_id,
          title: "🏆 You're Funded — New Account Provisioned",
          message: `Congratulations — you are now a funded trader! Your funded account is ready. Login: ${poolResult.mt5Login} · Server: ${poolResult.mt5Server}. Start trading and request your first payout!`,
          type: "success",
        });

        // Email
        await sendEventEmail({ type: "funded", accountId: poolResult.accountId }).catch((e) =>
          console.error("[auto-progress] funded email failed:", e),
        );

        // Telegram
        await supabaseAdmin.rpc("send_telegram" as never, {
          p_message: `🏆 <b>Trader Auto-Funded</b>\nUser: ${account.user_id}\nNew Login: ${poolResult.mt5Login}\nServer: ${poolResult.mt5Server}\nSize: ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()}`,
        } as never);

        processed++;
      }
    } catch (e) {
      console.error(`[auto-progress] Unexpected error for account ${account.id}:`, e);
      // Restore pending flag so it retries next cycle
      await supabaseAdmin
        .from("trader_accounts")
        .update({ phase_progression_pending: account.phase_progression_pending } as never)
        .eq("id", account.id)
        .eq("phase_progression_pending", `processing_${account.phase_progression_pending}`);
      failed++;
    }
  }

  return Response.json({ ok: true, processed, failed });
}
