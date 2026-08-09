import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";
import { claimPoolAccount } from "@/lib/account-pool.server";
import { sendTelegramWithButtons } from "@/lib/telegram.server";
import { sendDiscordNotification } from "@/lib/discord.server";

const AddSocialProofInput = z.object({
  accessToken: z.string().min(1),
  label: z.string().min(1),
  image_url: z.string().url(),
  storage_path: z.string().optional(),
  category: z.string().min(1),
  display_order: z.number().int().min(0),
});

export const addSocialProofServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AddSocialProofInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const { error: insertError } = await supabaseAdmin
        .from("social_proof_items")
        .insert({
          label: data.label,
          image_url: data.image_url,
          storage_path: data.storage_path ?? null,
          category: data.category,
          display_order: data.display_order,
        } as never);

      if (insertError) return { ok: false as const, error: insertError.message };
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Add failed";
      console.error("[addSocialProofServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

async function assertAdmin(token: string) {
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return { ok: false as const, error: "Please sign in again" };
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  if (!roles?.some((r) => r.role === "admin")) return { ok: false as const, error: "Forbidden: admin role required" };
  return { ok: true as const, userId: authData.user.id };
}

async function assertUser(token: string) {
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return { ok: false as const, error: "Please sign in again" };
  return { ok: true as const, userId: authData.user.id };
}

// ---------------------------------------------------------------------------
// Request payout (trader-side) + send email notification
// ---------------------------------------------------------------------------
const RequestPayoutInput = z.object({
  accessToken: z.string().min(1),
  userId: z.string().uuid(),
  traderAccountId: z.string().uuid(),
  amountNaira: z.number().positive(),
  profitPercent: z.number(),
  bankDetails: z.object({
    account_number: z.string(),
    bank_name: z.string(),
    account_name: z.string(),
  }),
});

export const requestPayoutServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RequestPayoutInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertUser(data.accessToken);
      if (!auth.ok) return auth;
      if (auth.userId !== data.userId) return { ok: false as const, error: "Unauthorized" };

      const { data: payoutInsert, error: insertErr } = await supabaseAdmin
        .from("payouts")
        .insert({
          user_id: data.userId,
          trader_account_id: data.traderAccountId,
          amount_naira: data.amountNaira,
          profit_percent: data.profitPercent,
          payment_method: "bank_transfer",
          wallet_address: null,
          bank_details: data.bankDetails,
        } as never)
        .select("id")
        .single();

      if (insertErr || !payoutInsert) return { ok: false as const, error: insertErr?.message ?? "Insert failed" };

      await sendEventEmail({ type: "payout_requested", payoutId: (payoutInsert as any).id }).catch((e) =>
        console.error("[requestPayoutServer] email send failed", e),
      );

      // Send Telegram with Approve/Reject buttons
      const { data: traderAcc } = await supabaseAdmin
        .from("trader_accounts")
        .select("mt5_login, currency, starting_balance, profiles(full_name), challenges(name)")
        .eq("id", data.traderAccountId)
        .maybeSingle();

      const traderName = (traderAcc as any)?.profiles?.full_name ?? "Unknown";
      const mt5Login = (traderAcc as any)?.mt5_login ?? "?";
      const challengeName = (traderAcc as any)?.challenges?.name ?? "?";
      const payoutCurrency = (traderAcc as any)?.currency ?? "NGN";
      const startingBalance = Number((traderAcc as any)?.starting_balance ?? 0);

      const amountDisplay = payoutCurrency === "USD"
        ? `$${(data.amountNaira / 1550).toFixed(2)} (~N${data.amountNaira.toLocaleString()})`
        : `N${data.amountNaira.toLocaleString()}`;

      const balanceDisplay = payoutCurrency === "USD"
        ? `$${startingBalance.toLocaleString()}`
        : `N${startingBalance.toLocaleString()}`;

      await sendTelegramWithButtons(
        `Payout Request\n\n` +
        `Trader: <b>${traderName}</b>\n` +
        `MT5: <code>${mt5Login}</code>\n` +
        `Account: ${challengeName} ${balanceDisplay}\n` +
        `Amount: <b>${amountDisplay}</b>\n` +
        `Profit: ${data.profitPercent.toFixed(2)}%\n` +
        `Bank: ${data.bankDetails.bank_name} — ${data.bankDetails.account_number}\n` +
        `Account Name: ${data.bankDetails.account_name}`,
        [
          [
            { text: "✅ Approve", callback_data: `approve_payout:${(payoutInsert as any).id}` },
            { text: "❌ Reject", callback_data: `reject_payout:${(payoutInsert as any).id}` },
          ],
        ],
      ).catch((e) => console.error("[requestPayoutServer] telegram failed", e));

      return { ok: true as const, payoutId: (payoutInsert as any).id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      console.error("[requestPayoutServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Update payout status + send email notification
// ---------------------------------------------------------------------------
const UpdatePayoutInput = z.object({
  accessToken: z.string().min(1),
  payoutId: z.string().uuid(),
  status: z.enum(["approved", "paid", "rejected"]),
});

export const updatePayoutServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdatePayoutInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const { error } = await supabaseAdmin
        .from("payouts")
        .update({ status: data.status, processed_at: new Date().toISOString() })
        .eq("id", data.payoutId);
      if (error) return { ok: false as const, error: error.message };

      if (data.status === "approved") {
        await sendEventEmail({ type: "payout_approved", payoutId: data.payoutId }).catch((e) =>
          console.error("[updatePayoutServer] payout_approved email failed", e),
        );

        const { data: payoutApproved } = await supabaseAdmin
          .from("payouts")
          .select("amount_naira, trader_account_id")
          .eq("id", data.payoutId)
          .maybeSingle();

        if (payoutApproved) {
          const { data: accApproved } = await supabaseAdmin
            .from("trader_accounts")
            .select("mt5_login, currency, starting_balance, profiles(full_name)")
            .eq("id", payoutApproved.trader_account_id)
            .maybeSingle();

          if (accApproved) {
            const fullName = (accApproved as any)?.profiles?.full_name ?? "Trader";
            const cur = (accApproved as any)?.currency ?? "NGN";
            const amountNaira = Number(payoutApproved.amount_naira ?? 0);
            const balance = Number((accApproved as any)?.starting_balance ?? 0);
            const payoutDisplay = cur === "USD" ? `$${(amountNaira / 1550).toFixed(2)}` : `₦${amountNaira.toLocaleString()}`;
            const balanceDisplay = cur === "USD" ? `$${balance.toLocaleString()}` : `₦${balance.toLocaleString()}`;

            await sendDiscordNotification(
              `💵 **Payout Approved**`,
              [{
                title: `💵 Payout Approved — ${fullName}`,
                color: 0xf1c40f,
                fields: [
                  { name: "Trader", value: fullName, inline: true },
                  { name: "Amount", value: payoutDisplay, inline: true },
                  { name: "Account", value: balanceDisplay, inline: true },
                  { name: "MT5", value: `\`${(accApproved as any)?.mt5_login ?? "?"}\``, inline: true },
                ],
                timestamp: new Date().toISOString(),
              }],
            ).catch((e) => console.error("[updatePayoutServer] discord payout_approved failed", e));

            const avatarInitials = fullName.split(" ").slice(0, 2)
              .map((w: string) => w[0]?.toUpperCase() ?? "").join("");

            await supabaseAdmin.from("live_activity").insert({
              event_type: "payout_approved",
              anonymized_name: fullName,
              avatar_initials: avatarInitials,
              challenge_name: "",
              currency: cur,
              amount: Math.round(amountNaira * 100) / 100,
              account_size: balance,
            } as never);
          }
        }
      } else if (data.status === "paid") {
        const { data: payout } = await supabaseAdmin
          .from("payouts")
          .select("trader_account_id")
          .eq("id", data.payoutId)
          .maybeSingle();
        if (payout?.trader_account_id) {
          const { data: account } = await supabaseAdmin
            .from("trader_accounts")
            .select("id, starting_balance")
            .eq("id", payout.trader_account_id)
            .maybeSingle();
          if (account) {
            await supabaseAdmin
              .from("trader_accounts")
              .update({ current_equity: account.starting_balance, peak_equity: account.starting_balance, daily_peak_equity: account.starting_balance, daily_peak_date: new Date().toISOString().slice(0, 10), trading_days: 0 } as never)
              .eq("id", account.id);
            await supabaseAdmin
              .from("account_snapshots")
              .insert({ trader_account_id: account.id, equity: account.starting_balance, balance: account.starting_balance, profit: 0, drawdown_percent: 0, snapshot_time: new Date().toISOString() } as never);

            // Pause monitor for this account to prevent MT5 balance from overwriting reset
            await supabaseAdmin
              .from("trader_accounts")
              .update({
                monitor_paused: true,
                monitor_paused_at: new Date().toISOString(),
                monitor_paused_reason: `Payout paid — awaiting MT5 balance reset on Exness`,
              } as never)
              .eq("id", account.id);

            // Send urgent Telegram reminder
            const { data: fullAccount } = await supabaseAdmin
              .from("trader_accounts")
              .select("mt5_login, mt5_server, currency, starting_balance, profiles(full_name)")
              .eq("id", account.id)
              .maybeSingle();

            const { data: payoutDetails } = await supabaseAdmin
              .from("payouts")
              .select("amount_naira")
              .eq("id", data.payoutId)
              .maybeSingle();

            // Post to live activity feed
            {
              const fullName = (fullAccount as any)?.profiles?.full_name ?? "Trader";
              const avatarInitials = fullName.split(" ").slice(0, 2)
                .map((w: string) => w[0]?.toUpperCase() ?? "").join("");

              const cur = (fullAccount as any)?.currency ?? "NGN";
              const amountNaira = Number(payoutDetails?.amount_naira ?? 0);
              const displayAmount = cur === "USD" ? amountNaira / 1550 : amountNaira;

              await supabaseAdmin.from("live_activity").insert({
                event_type: "payout_paid",
                anonymized_name: fullName,
                avatar_initials: avatarInitials,
                challenge_name: "",
                currency: cur,
                amount: Math.round(displayAmount * 100) / 100,
                account_size: Number((fullAccount as any)?.starting_balance ?? 0),
              } as never);
            }

            const traderName = (fullAccount as any)?.profiles?.full_name ?? "Unknown Trader";
            const mt5Login = (fullAccount as any)?.mt5_login ?? "?";
            const mt5Server = (fullAccount as any)?.mt5_server ?? "Exness-MT5Trial9";
            const currency = (fullAccount as any)?.currency ?? "NGN";
            const startingBalance = Number((fullAccount as any)?.starting_balance ?? 0);
            const payoutAmount = Number(payoutDetails?.amount_naira ?? 0);

            const balanceDisplay = currency === "USD"
              ? `$${startingBalance.toLocaleString()}`
              : `₦${startingBalance.toLocaleString()}`;

            const payoutDisplay = currency === "USD"
              ? `$${(payoutAmount / 1550).toFixed(2)}`
              : `₦${payoutAmount.toLocaleString()}`;

            try {
              await supabaseAdmin.rpc("send_telegram" as never, {
                p_message:
                  `🔴 <b>ACTION REQUIRED — MT5 Reset Needed</b>\n\n` +
                  `Trader: <b>${traderName}</b>\n` +
                  `MT5 Login: <code>${mt5Login}</code>\n` +
                  `Server: ${mt5Server}\n` +
                  `Account Size: ${balanceDisplay}\n` +
                  `Payout Paid: ${payoutDisplay}\n\n` +
                  `⚠️ <b>Go to Exness Partner Portal NOW and reset this account balance to ${balanceDisplay}</b>\n\n` +
                  `🛑 Monitor is PAUSED for this account until you confirm the reset.\n` +
                  `✅ Click "MT5 Reset Done" in the admin panel to resume monitoring.`,
              } as never);
            } catch (e) {
              console.error("[updatePayoutServer] telegram reminder failed", e);
            }

            await sendDiscordNotification(
              `✅ **Payout Completed**`,
              [{
                title: `✅ Payout Completed — ${traderName}`,
                color: 0x1ec97e,
                fields: [
                  { name: "Trader", value: traderName, inline: true },
                  { name: "Amount", value: payoutDisplay, inline: true },
                  { name: "Account", value: balanceDisplay, inline: true },
                  { name: "MT5", value: `\`${mt5Login}\``, inline: true },
                ],
                timestamp: new Date().toISOString(),
              }],
            ).catch((e) => console.error("[updatePayoutServer] discord payout_paid failed", e));
          }
        }
        await sendEventEmail({ type: "payout_paid", payoutId: data.payoutId }).catch((e) =>
          console.error("[updatePayoutServer] payout_paid email failed", e),
        );
      } else if (data.status === "rejected") {
        await sendEventEmail({ type: "payout_rejected", payoutId: data.payoutId, reason: "Rejected by admin." }).catch((e) =>
          console.error("[updatePayoutServer] payout_rejected email failed", e),
        );
      }

      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      console.error("[updatePayoutServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Confirm MT5 Reset — unpause monitor after payout
// ---------------------------------------------------------------------------
const ConfirmMt5ResetInput = z.object({
  accessToken: z.string().min(1),
  traderAccountId: z.string().uuid(),
});

export const confirmMt5ResetServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConfirmMt5ResetInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const { error } = await supabaseAdmin
        .from("trader_accounts")
        .update({
          monitor_paused: false,
          monitor_paused_at: null,
          monitor_paused_reason: null,
        } as never)
        .eq("id", data.traderAccountId);

      if (error) return { ok: false as const, error: error.message };

      // Confirm via Telegram
      const { data: account } = await supabaseAdmin
        .from("trader_accounts")
        .select("mt5_login, profiles(full_name)")
        .eq("id", data.traderAccountId)
        .maybeSingle();

      const name = (account as any)?.profiles?.full_name ?? "Trader";
      const login = (account as any)?.mt5_login ?? "?";

      try {
        await supabaseAdmin.rpc("send_telegram" as never, {
          p_message: `✅ <b>MT5 Reset Confirmed</b>\nTrader: ${name}\nLogin: <code>${login}</code>\nMonitor resumed — equity sync active again.`,
        } as never);
      } catch (e) {
        console.error("[confirmMt5ResetServer] telegram failed", e);
      }

      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      console.error("[confirmMt5ResetServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Approve Phase 2 (reset equity, bump phase, send email)
// ---------------------------------------------------------------------------
const ApprovePhase2Input = z.object({
  accessToken: z.string().min(1),
  accountId: z.string().uuid(),
});

export const approvePhase2Server = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ApprovePhase2Input.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const { data: acc } = await supabaseAdmin
        .from("trader_accounts")
        .select("user_id, starting_balance, currency, challenge_id, order_id, current_phase, status")
        .eq("id", data.accountId)
        .maybeSingle();

      if (!acc) return { ok: false as const, error: "Account not found" };
      if ((acc as any).current_phase >= 2) return { ok: false as const, error: "Already in Phase 2 or beyond" };

      const isUsd = (acc as any).currency === "USD";
      const startingBalance = Number((acc as any).starting_balance);

      // 1. Mark Phase 1 account as passed
      const { error: passErr } = await supabaseAdmin
        .from("trader_accounts")
        .update({
          status: "passed",
          phase1_passed_at: new Date().toISOString(),
          phase2_requested_at: null,
        } as never)
        .eq("id", data.accountId);

      if (passErr) return { ok: false as const, error: passErr.message };

      // 2. Claim a fresh account from the pool for Phase 2
      const poolResult = await claimPoolAccount({
        orderId: (acc as any).order_id,
        accountSizeNgn: isUsd ? 0 : startingBalance,
        accountSizeUsd: isUsd ? startingBalance : undefined,
        currency: (acc as any).currency ?? "NGN",
        challengeId: (acc as any).challenge_id,
        userId: (acc as any).user_id,
        phaseProgression: true,
      });

      if (!poolResult.ok) {
        // Rollback Phase 1 status if pool claim fails
        await supabaseAdmin
          .from("trader_accounts")
          .update({ status: "active", phase1_passed_at: null } as never)
          .eq("id", data.accountId);
        return { ok: false as const, error: `Pool unavailable: ${poolResult.error}` };
      }

      // 3. Set the new account to Phase 2
      await supabaseAdmin
        .from("trader_accounts")
        .update({
          current_phase: 2,
          phase1_passed_at: new Date().toISOString(),
          trading_days: 0,
        } as never)
        .eq("id", poolResult.accountId);

      // 4. Notify trader with new credentials
      await supabaseAdmin.from("notifications").insert({
        user_id: (acc as any).user_id,
        title: "🎯 Phase 1 Passed — New Account Provisioned",
        message: `Congratulations — you passed Phase 1! Your Phase 2 account is ready. New Login: ${poolResult.mt5Login} · Server: ${poolResult.mt5Server}. Your starting balance is ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()}. Good luck!`,
        type: "success",
      } as never);

      // 5. Send phase 1 passed email
      await sendEventEmail({ type: "phase1_passed", accountId: poolResult.accountId }).catch((e) =>
        console.error("[approvePhase2Server] email send failed", e),
      );

      // 6. Telegram alert to admin
      await supabaseAdmin.rpc("send_telegram" as never, {
        p_message: `🎯 <b>Phase 2 Provisioned</b>\nTrader: ${(acc as any).user_id}\nNew Login: ${poolResult.mt5Login}\nServer: ${poolResult.mt5Server}\nSize: ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()}`,
      } as never);

      // 7. Post to live activity feed
      {
        const { data: profileData } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", (acc as any).user_id)
          .maybeSingle();

        const fullName = (profileData as any)?.full_name ?? "Trader";
        const avatarInitials = fullName.split(" ").slice(0, 2)
          .map((w: string) => w[0]?.toUpperCase() ?? "").join("");

        const { data: challengeData } = await supabaseAdmin
          .from("challenges")
          .select("name")
          .eq("id", (acc as any).challenge_id)
          .maybeSingle();

        await supabaseAdmin.from("live_activity").insert({
          event_type: "phase2_approved",
          anonymized_name: fullName,
          avatar_initials: avatarInitials,
          challenge_name: (challengeData as any)?.name ?? "",
          currency: (acc as any).currency ?? "NGN",
          account_size: startingBalance,
        } as never);

        const isUsdCurrency = (acc as any).currency === "USD";
        const sizeDisplay = isUsdCurrency ? `$${startingBalance.toLocaleString()}` : `₦${startingBalance.toLocaleString()}`;

        await sendDiscordNotification(
          `🎯 **Phase 2 Approved**`,
          [{
            title: `🎯 Phase 2 Approved — ${fullName}`,
            color: 0x3498db,
            fields: [
              { name: "Trader", value: fullName, inline: true },
              { name: "Account", value: `${sizeDisplay}`, inline: true },
              { name: "Challenge", value: (challengeData as any)?.name ?? "Standard", inline: true },
              { name: "MT5", value: `\`${poolResult.mt5Login}\``, inline: true },
            ],
            timestamp: new Date().toISOString(),
          }],
        ).catch((e) => console.error("[approvePhase2Server] discord failed", e));
      }

      return { ok: true as const, newAccountId: poolResult.accountId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Approval failed";
      console.error("[approvePhase2Server] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Approve Funded (reset equity, mark funded, send email)
// ---------------------------------------------------------------------------
const ApproveFundedInput = z.object({
  accessToken: z.string().min(1),
  accountId: z.string().uuid(),
});

export const approveFundedServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ApproveFundedInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const { data: acc } = await supabaseAdmin
        .from("trader_accounts")
        .select("user_id, starting_balance, currency, challenge_id, order_id, current_phase, status")
        .eq("id", data.accountId)
        .maybeSingle();

      if (!acc) return { ok: false as const, error: "Account not found" };
      if ((acc as any).status === "funded") return { ok: false as const, error: "Already funded" };

      const isUsd = (acc as any).currency === "USD";
      const startingBalance = Number((acc as any).starting_balance);

      // 1. Mark Phase 2 account as passed
      const { error: passErr } = await supabaseAdmin
        .from("trader_accounts")
        .update({
          status: "passed",
          phase2_passed_at: new Date().toISOString(),
          funded_requested_at: null,
        } as never)
        .eq("id", data.accountId);

      if (passErr) return { ok: false as const, error: passErr.message };

      // 2. Claim fresh funded account from pool
      const poolResult = await claimPoolAccount({
        orderId: (acc as any).order_id,
        accountSizeNgn: isUsd ? 0 : startingBalance,
        accountSizeUsd: isUsd ? startingBalance : undefined,
        currency: (acc as any).currency ?? "NGN",
        challengeId: (acc as any).challenge_id,
        userId: (acc as any).user_id,
        phaseProgression: true,
      });

      if (!poolResult.ok) {
        // Rollback if pool claim fails
        await supabaseAdmin
          .from("trader_accounts")
          .update({ status: "active", phase2_passed_at: null } as never)
          .eq("id", data.accountId);
        return { ok: false as const, error: `Pool unavailable: ${poolResult.error}` };
      }

      // 3. Set funded status on new account
      await supabaseAdmin
        .from("trader_accounts")
        .update({
          status: "funded",
          current_phase: 3,
          funded_at: new Date().toISOString(),
          trading_days: 0,
        } as never)
        .eq("id", poolResult.accountId);

      // 4. Notify trader
      await supabaseAdmin.from("notifications").insert({
        user_id: (acc as any).user_id,
        title: "🏆 You're Funded — New Account Provisioned",
        message: `Congratulations — you are now a funded trader! Your funded account is ready. Login: ${poolResult.mt5Login} · Server: ${poolResult.mt5Server}. Start trading and request your first payout!`,
        type: "success",
      } as never);

      // 5. Email
      await sendEventEmail({ type: "funded", accountId: poolResult.accountId }).catch((e) =>
        console.error("[approveFundedServer] email send failed", e),
      );

      // 6. Telegram
      await supabaseAdmin.rpc("send_telegram" as never, {
        p_message: `🏆 <b>Trader Funded</b>\nUser: ${(acc as any).user_id}\nNew Login: ${poolResult.mt5Login}\nServer: ${poolResult.mt5Server}\nSize: ${isUsd ? "$" : "₦"}${startingBalance.toLocaleString()}`,
      } as never);

      // 7. Post to live activity feed
      {
        const { data: profileData } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", (acc as any).user_id)
          .maybeSingle();

        const fullName = (profileData as any)?.full_name ?? "Trader";
        const avatarInitials = fullName.split(" ").slice(0, 2)
          .map((w: string) => w[0]?.toUpperCase() ?? "").join("");

        const { data: challengeData } = await supabaseAdmin
          .from("challenges")
          .select("name")
          .eq("id", (acc as any).challenge_id)
          .maybeSingle();

        await supabaseAdmin.from("live_activity").insert({
          event_type: "funded_approved",
          anonymized_name: fullName,
          avatar_initials: avatarInitials,
          challenge_name: (challengeData as any)?.name ?? "",
          currency: (acc as any).currency ?? "NGN",
          account_size: startingBalance,
        } as never);

        const isUsdCurrency = (acc as any).currency === "USD";
        const sizeDisplay = isUsdCurrency ? `$${startingBalance.toLocaleString()}` : `₦${startingBalance.toLocaleString()}`;

        await sendDiscordNotification(
          `🏆 **New Funded Trader**`,
          [{
            title: `🏆 New Funded Trader — ${fullName}`,
            color: 0x1ec97e,
            fields: [
              { name: "Trader", value: fullName, inline: true },
              { name: "Account Size", value: `${sizeDisplay}`, inline: true },
              { name: "Challenge", value: (challengeData as any)?.name ?? "Standard", inline: true },
              { name: "MT5", value: `\`${poolResult.mt5Login}\``, inline: true },
            ],
            timestamp: new Date().toISOString(),
          }],
        ).catch((e) => console.error("[approveFundedServer] discord failed", e));
      }

      return { ok: true as const, newAccountId: poolResult.accountId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Approval failed";
      console.error("[approveFundedServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Mark account as breached
// ---------------------------------------------------------------------------
const MarkBreachedInput = z.object({
  accessToken: z.string().min(1),
  accountId: z.string().uuid(),
  reason: z.string().min(1),
});

export const markBreachedServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => MarkBreachedInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const { error } = await supabaseAdmin
        .from("trader_accounts")
        .update({
          status: "breached",
          breach_reason: data.reason.trim(),
        } as never)
        .eq("id", data.accountId);
      if (error) return { ok: false as const, error: error.message };

      await sendEventEmail({ type: "breached", accountId: data.accountId, reason: data.reason.trim() }).catch((e) =>
        console.error("[markBreachedServer] email send failed", e),
      );

      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Breach failed";
      console.error("[markBreachedServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Social Proof — Update item
// ---------------------------------------------------------------------------
const UpdateSocialProofInput = z.object({
  accessToken: z.string().min(1),
  id: z.string().uuid(),
  display_order: z.number().int().min(0).optional(),
  is_visible: z.boolean().optional(),
});

export const updateSocialProofServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateSocialProofInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const updates: Record<string, unknown> = {};
      if (data.display_order !== undefined) updates.display_order = data.display_order;
      if (data.is_visible !== undefined) updates.is_visible = data.is_visible;
      if (Object.keys(updates).length === 0) return { ok: false as const, error: "No fields to update" };

      const { error } = await supabaseAdmin
        .from("social_proof_items")
        .update(updates as never)
        .eq("id", data.id);

      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      console.error("[updateSocialProofServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Social Proof — Delete item
// ---------------------------------------------------------------------------
const DeleteSocialProofInput = z.object({
  accessToken: z.string().min(1),
  id: z.string().uuid(),
  storage_path: z.string().optional(),
});

export const deleteSocialProofServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteSocialProofInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      if (data.storage_path) {
        await supabaseAdmin.storage.from("social-proof").remove([data.storage_path]);
      }

      const { error } = await supabaseAdmin
        .from("social_proof_items")
        .delete()
        .eq("id", data.id);

      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      console.error("[deleteSocialProofServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Send Telegram notification with inline buttons for phase progression requests
// ---------------------------------------------------------------------------
const PhaseRequestNotificationInput = z.object({
  accessToken: z.string().min(1),
  accountId: z.string().uuid(),
  phase: z.enum(["phase2", "funded"]),
});

export const sendPhaseRequestNotificationServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PhaseRequestNotificationInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertUser(data.accessToken);
      if (!auth.ok) return auth;

      const { data: acc } = await supabaseAdmin
        .from("trader_accounts")
        .select(`
          id, mt5_login, currency, starting_balance, current_phase,
          trading_days, scalping_warnings,
          challenges(name, min_trading_days, profit_target_percent),
          profiles(full_name)
        `)
        .eq("id", data.accountId)
        .maybeSingle();

      if (!acc) return { ok: false as const, error: "Account not found" };

      const traderName = (acc as any).profiles?.full_name ?? "Unknown";
      const mt5Login = (acc as any).mt5_login ?? "?";
      const challengeName = (acc as any).challenges?.name ?? "?";
      const currency = (acc as any).currency ?? "NGN";
      const startingBalance = Number((acc as any).starting_balance ?? 0);
      const tradingDays = (acc as any).trading_days ?? 0;
      const scalpingWarnings = (acc as any).scalping_warnings ?? 0;
      const minDays = currency === "USD" ? 5 : ((acc as any).challenges?.min_trading_days ?? 3);
      const profitTarget = (acc as any).challenges?.profit_target_percent ?? 10;

      const isPhase2 = data.phase === "phase2";
      const title = isPhase2 ? "Phase 2 Request" : "Funded Request";
      const approveAction = isPhase2 ? "approve_phase2" : "approve_funded";
      const rejectAction = isPhase2 ? "reject_phase2" : "reject_funded";

      const balanceDisplay = currency === "USD"
        ? `$${startingBalance.toLocaleString()}`
        : `N${startingBalance.toLocaleString()}`;

      const daysCheck = tradingDays >= minDays ? "+" : "!";
      const scalpingCheck = scalpingWarnings < 4 ? "+" : "!";

      await sendTelegramWithButtons(
        `${title}\n\n` +
        `Trader: <b>${traderName}</b>\n` +
        `MT5: <code>${mt5Login}</code>\n` +
        `Account: ${challengeName} ${balanceDisplay}\n` +
        `Profit Target: ${profitTarget}%\n` +
        `${daysCheck} Trading Days: ${tradingDays}/${minDays}\n` +
        `${scalpingCheck} Scalping: ${scalpingWarnings}/4\n`,
        [
          [
            { text: "Approve & Provision", callback_data: `${approveAction}:${data.accountId}` },
            { text: "Reject", callback_data: `${rejectAction}:${data.accountId}` },
          ],
        ],
      );

      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Manual activity logging — admin logs trader milestones + generates cert
// ---------------------------------------------------------------------------
function randomHex6(): string {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16)).join("").toUpperCase();
}

const AddManualActivityInput = z.object({
  accessToken: z.string().min(1),
  traderName: z.string().min(1),
  accountSize: z.number().positive(),
  challengeName: z.string().default("Standard"),
  mt5Login: z.string().default(""),
  eventType: z.enum(["phase1_to_phase2", "phase2_to_funded", "payout_approved"]),
  payoutAmount: z.number().positive().optional(),
});

export const addManualActivityServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AddManualActivityInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const initials = data.traderName
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");

      const currentPhase =
        data.eventType === "phase1_to_phase2" ? 2
        : data.eventType === "phase2_to_funded" ? 3
        : 3;

      const certKind = data.eventType === "payout_approved" ? "payout" : "funded";
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const certNumber = certKind === "payout"
        ? `FNG-PAY-${dateStr}-${randomHex6()}`
        : `FNG-FND-${dateStr}-${randomHex6()}`;

      const certMeta = {
        certificate_number: certNumber,
        full_name: data.traderName,
        account_size: data.accountSize,
        challenge_name: data.challengeName,
        mt5_login: data.mt5Login || "N/A",
        kind: certKind,
        payout_amount: certKind === "payout" ? (data.payoutAmount ?? 0) : null,
        issued_at: new Date().toISOString(),
        current_phase: currentPhase,
      };

      const { error: actErr } = await supabaseAdmin.from("live_activity").insert({
        event_type: data.eventType,
        anonymized_name: data.traderName,
        avatar_initials: initials,
        challenge_name: data.challengeName,
        currency: "NGN",
        amount: certKind === "payout" ? (data.payoutAmount ?? 0) : null,
        account_size: data.accountSize,
        metadata: certMeta,
      } as never);

      if (actErr) return { ok: false as const, error: actErr.message };

      const eventLabels: Record<string, { emoji: string; title: string; color: number }> = {
        phase1_to_phase2: { emoji: "🎯", title: "Phase 2 Approved", color: 0x3498db },
        phase2_to_funded: { emoji: "🏆", title: "New Funded Trader", color: 0x1ec97e },
        payout_approved: { emoji: "💵", title: "Payout Approved", color: 0xf1c40f },
      };
      const cfg = eventLabels[data.eventType] ?? { emoji: "📌", title: "Milestone", color: 0x95a5a6 };
      const payoutAmt = data.payoutAmount ? `₦${data.payoutAmount.toLocaleString()}` : null;

      await sendDiscordNotification(
        `${cfg.emoji} **${cfg.title}**`,
        [{
          title: `${cfg.emoji} ${cfg.title} — ${data.traderName}`,
          color: cfg.color,
          fields: [
            { name: "Trader", value: data.traderName, inline: true },
            { name: "Account Size", value: `₦${data.accountSize.toLocaleString()}`, inline: true },
            { name: "Challenge", value: data.challengeName || "Standard", inline: true },
            ...(data.mt5Login ? [{ name: "MT5", value: `\`${data.mt5Login}\``, inline: true } as const] : []),
            ...(payoutAmt ? [{ name: "Payout", value: payoutAmt, inline: true } as const] : []),
          ],
          timestamp: new Date().toISOString(),
        }],
      ).catch((e) => console.error("[addManualActivityServer] discord failed", e));

      return { ok: true as const, certificate: certMeta };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      console.error("[addManualActivityServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Advance manual phase — admin promotes trader to next phase
// ---------------------------------------------------------------------------
const AdvanceManualPhaseInput = z.object({
  accessToken: z.string().min(1),
  activityId: z.string().uuid(),
});

export const advanceManualPhaseServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AdvanceManualPhaseInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const { data: row, error: fetchErr } = await supabaseAdmin
        .from("live_activity")
        .select("*")
        .eq("id", data.activityId)
        .maybeSingle();

      if (fetchErr || !row) return { ok: false as const, error: "Activity not found" };

      const meta = (row as any).metadata ?? {};
      const currentPhase = meta.current_phase ?? 1;

      if (currentPhase >= 3) return { ok: false as const, error: "Already funded — cannot advance further" };

      const initials = (row as any).anonymized_name
        .split(" ")
        .slice(0, 2)
        .map((w: string) => w[0]?.toUpperCase() ?? "")
        .join("");

      const newPhase = currentPhase + 1;
      const newEventType = newPhase === 3 ? "phase2_to_funded" : "phase1_to_phase2";
      const certKind = "funded";
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const certNumber = `FNG-FND-${dateStr}-${randomHex6()}`;

      const newCertMeta = {
        certificate_number: certNumber,
        full_name: (row as any).anonymized_name,
        account_size: (row as any).account_size,
        challenge_name: (row as any).challenge_name,
        mt5_login: meta.mt5_login ?? "N/A",
        kind: certKind,
        payout_amount: null,
        issued_at: new Date().toISOString(),
        current_phase: newPhase,
      };

      const { error: insErr } = await supabaseAdmin.from("live_activity").insert({
        event_type: newEventType,
        anonymized_name: (row as any).anonymized_name,
        avatar_initials: initials,
        challenge_name: (row as any).challenge_name,
        currency: (row as any).currency ?? "NGN",
        account_size: (row as any).account_size,
        metadata: newCertMeta,
      } as never);

      if (insErr) return { ok: false as const, error: insErr.message };

      return { ok: true as const, certificate: newCertMeta };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      console.error("[advanceManualPhaseServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

// ---------------------------------------------------------------------------
// Manual leaderboard — admin adds curated leaderboard entries
// ---------------------------------------------------------------------------
const AddManualLeaderboardInput = z.object({
  accessToken: z.string().min(1),
  traderName: z.string().min(1),
  challengeName: z.string().default("Standard"),
  accountSize: z.number().positive(),
  profitPercent: z.number(),
});

export const addManualLeaderboardServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AddManualLeaderboardInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const initials = data.traderName
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");

      const profitAmount = Math.round(data.accountSize * (data.profitPercent / 100) * 100) / 100;
      const totalProfit = profitAmount;

      const { error } = await supabaseAdmin.from("manual_leaderboard").insert({
        trader_name: data.traderName,
        avatar_initials: initials,
        challenge_name: data.challengeName,
        account_size: data.accountSize,
        profit_percent: data.profitPercent,
        profit_amount: profitAmount,
        total_profit: totalProfit,
      } as never);

      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      console.error("[addManualLeaderboardServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });

const DeleteManualLeaderboardInput = z.object({
  accessToken: z.string().min(1),
  id: z.string().uuid(),
});

export const deleteManualLeaderboardServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteManualLeaderboardInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const { error } = await supabaseAdmin
        .from("manual_leaderboard")
        .delete()
        .eq("id", data.id);

      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      console.error("[deleteManualLeaderboardServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });
