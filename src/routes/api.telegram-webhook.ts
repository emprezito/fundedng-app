import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { answerCallbackQuery, editTelegramMessage, editTelegramMessageWithButtons } from "@/lib/telegram.server";
import { sendEventEmail } from "@/lib/email.server";
import { claimPoolAccount } from "@/lib/account-pool.server";
import { sendPushToUser } from "@/lib/push.server";

const ADMIN_TELEGRAM_ID = 8749650113;

export const Route = createFileRoute("/api/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("ok", { status: 200 });
        }

        const cq = body?.callback_query;
        if (!cq) return new Response("ok", { status: 200 });

        const callbackQueryId = cq.id;
        const fromId = cq.from?.id;
        const data = cq.data as string;
        const messageId = cq.message?.message_id;
        const chatId = cq.message?.chat?.id;

        if (fromId !== ADMIN_TELEGRAM_ID) {
          await answerCallbackQuery(callbackQueryId, "Unauthorized", true);
          return new Response("ok", { status: 200 });
        }

        const [action, id] = data.split(":");

        try {
          switch (action) {
            // ── PAYOUT APPROVALS ─────────────────────────────────────────

            case "approve_payout": {
              const { data: payout } = await supabaseAdmin
                .from("payouts")
                .select("id, status, amount_naira, trader_account_id, profiles(full_name)")
                .eq("id", id)
                .maybeSingle();

              if (!payout) {
                await answerCallbackQuery(callbackQueryId, "Payout not found", true);
                break;
              }
              if ((payout as any).status !== "pending") {
                await answerCallbackQuery(callbackQueryId, `Already ${(payout as any).status}`, true);
                break;
              }

              const { error } = await supabaseAdmin
                .from("payouts")
                .update({ status: "approved", processed_at: new Date().toISOString() })
                .eq("id", id)
                .eq("status", "pending");

              if (error) {
                await answerCallbackQuery(callbackQueryId, "Error: " + error.message, true);
                break;
              }

              await sendEventEmail({ type: "payout_approved", payoutId: id }).catch(() => {});
              await answerCallbackQuery(callbackQueryId, "✅ Payout approved!", false);

              if (chatId && messageId) {
                await editTelegramMessageWithButtons(
                  chatId,
                  messageId,
                  cq.message.text + "\n\n✅ <b>APPROVED</b> by Emperor\n⏳ Now send the payment on your bank app, then tap Mark as Paid.",
                  [
                    [
                      { text: "💳 Mark as Paid", callback_data: `mark_paid:${id}` },
                      { text: "↩️ Undo Approve", callback_data: `undo_approve:${id}` },
                    ]
                  ]
                );
              }
              break;
            }

            case "mark_paid": {
              const { data: payout } = await supabaseAdmin
                .from("payouts")
                .select(`
                  id, status, amount_naira, profit_percent, trader_account_id, user_id,
                  trader_accounts(
                    id, user_id, mt5_login, mt5_server, currency,
                    starting_balance, current_phase, challenge_id, order_id,
                    challenges(name),
                    profiles(full_name)
                  )
                `)
                .eq("id", id)
                .maybeSingle();

              if (!payout) {
                await answerCallbackQuery(callbackQueryId, "Payout not found", true);
                break;
              }
              if ((payout as any).status !== "approved") {
                await answerCallbackQuery(callbackQueryId, "Payout must be approved first", true);
                break;
              }

              const account = (payout as any).trader_accounts;
              const currency = account?.currency ?? "NGN";
              const startingBalance = Number(account?.starting_balance ?? 0);
              const oldLogin = account?.mt5_login ?? "?";
              const traderName = account?.profiles?.full_name ?? "Trader";
              const challengeId = account?.challenge_id;
              const oldPhase = Number(account?.current_phase ?? 1);
              const balanceDisplay = currency === "USD"
                ? `$${startingBalance.toLocaleString()}`
                : `₦${startingBalance.toLocaleString()}`;
              const payoutAmount = Number((payout as any).amount_naira ?? 0);
              const payoutDisplay = currency === "USD"
                ? `$${(payoutAmount / 1550).toFixed(2)}`
                : `₦${payoutAmount.toLocaleString()}`;

              const { error } = await supabaseAdmin
                .from("payouts")
                .update({ status: "paid", paid_at: new Date().toISOString() })
                .eq("id", id)
                .eq("status", "approved");

              if (error) {
                await answerCallbackQuery(callbackQueryId, "Error: " + error.message, true);
                break;
              }

              // 1. Deactivate old account
              await supabaseAdmin
                .from("trader_accounts")
                .update({ status: "closed" } as never)
                .eq("id", account?.id);

              // 2. Provision new account from pool
              const traderUserId = account?.user_id ?? (payout as any)?.user_id;
              const newOrderId = crypto.randomUUID();
              const poolResult = await claimPoolAccount({
                orderId: newOrderId,
                accountSizeNgn: currency === "USD" ? 0 : startingBalance,
                accountSizeUsd: currency === "USD" ? startingBalance : undefined,
                currency,
                challengeId: challengeId ?? "",
                userId: traderUserId,
                phaseProgression: true,
              });

              let newLogin = "?";
              let newServer = "Exness-MT5Trial9";

              if (poolResult.ok) {
                newLogin = poolResult.mt5Login;
                newServer = poolResult.mt5Server;

                // 3. Set correct phase
                await supabaseAdmin
                  .from("trader_accounts")
                  .update({ current_phase: oldPhase } as never)
                  .eq("id", poolResult.accountId);

                // 4. In-app notification
                await supabaseAdmin
                  .from("notifications")
                  .insert({
                    user_id: traderUserId,
                    title: "🎉 Payout Processed — New Account Ready",
                    message: `Your payout of ${payoutDisplay} has been processed. A new account has been provisioned. New Login: ${poolResult.mt5Login} · Server: ${poolResult.mt5Server}. Your starting balance is ${balanceDisplay}. Check your dashboard for the password.`,
                    type: "success",
                  } as never);

                // 5. Web push
                await sendPushToUser(traderUserId, {
                  title: "🎉 Payout Processed — New Account Ready",
                  body: `Your new MT5 account is active. Tap to view credentials.`,
                  url: "/dashboard",
                }).catch(() => {});
              } else {
                // Pool empty — rollback
                await supabaseAdmin
                  .from("trader_accounts")
                  .update({ status: "active" } as never)
                  .eq("id", account?.id);
              }

              await sendEventEmail({ type: "payout_paid", payoutId: id }).catch(() => {});

              await answerCallbackQuery(callbackQueryId, "💳 Marked as paid!", false);

              if (chatId && messageId) {
                const statusLine = poolResult.ok
                  ? `✅ <b>APPROVED</b> → 💳 <b>PAID</b>\n\n` +
                    `🔄 <b>New account provisioned</b>\n` +
                    `Old Login: <code>${oldLogin}</code> → CLOSED\n` +
                    `New Login: <code>${newLogin}</code>\n` +
                    `Server: ${newServer}\n` +
                    `Phase: ${oldPhase} · Size: ${balanceDisplay}`
                  : `✅ <b>APPROVED</b> → 💳 <b>PAID</b>\n\n` +
                    `🔴 <b>Pool empty</b> — old account kept active.\n` +
                    `Login: <code>${oldLogin}</code>\n` +
                    `Please manually provision an account.`;

                await editTelegramMessageWithButtons(
                  chatId,
                  messageId,
                  cq.message.text.split("\n\n✅")[0] + "\n\n" + statusLine,
                  []
                );
              }
              break;
            }

            case "mt5_reset": {
              const { data: account } = await supabaseAdmin
                .from("trader_accounts")
                .select("id, mt5_login, monitor_paused, profiles(full_name)")
                .eq("id", id)
                .maybeSingle();

              if (!account) {
                await answerCallbackQuery(callbackQueryId, "Account not found", true);
                break;
              }
              if (!(account as any).monitor_paused) {
                await answerCallbackQuery(callbackQueryId, "Monitor not paused — already reset?", true);
                break;
              }

              await supabaseAdmin
                .from("trader_accounts")
                .update({
                  monitor_paused: false,
                  monitor_paused_at: null,
                  monitor_paused_reason: null,
                } as never)
                .eq("id", id);

              const traderName = (account as any).profiles?.full_name ?? "Trader";
              const mt5Login = (account as any).mt5_login ?? "?";

              await answerCallbackQuery(callbackQueryId, "✅ MT5 reset confirmed — monitoring resumed!", false);

              if (chatId && messageId) {
                await editTelegramMessageWithButtons(
                  chatId,
                  messageId,
                  cq.message.text.split("\n\n✅")[0] +
                    "\n\n✅ <b>APPROVED</b> → 💳 <b>PAID</b> → 🔄 <b>MT5 RESET ✓</b>\n\n" +
                    `Trader: ${traderName} (<code>${mt5Login}</code>)\n` +
                    `Monitor resumed. Payout complete. ✓`,
                  []
                );
              }
              break;
            }

            case "undo_approve": {
              const { error } = await supabaseAdmin
                .from("payouts")
                .update({ status: "pending", processed_at: null })
                .eq("id", id)
                .eq("status", "approved");

              if (error) {
                await answerCallbackQuery(callbackQueryId, "Error: " + error.message, true);
                break;
              }

              await answerCallbackQuery(callbackQueryId, "↩️ Approval undone", false);

              if (chatId && messageId) {
                await editTelegramMessageWithButtons(
                  chatId,
                  messageId,
                  cq.message.text.split("\n\n✅")[0] +
                    "\n\n↩️ <b>APPROVAL UNDONE</b> — back to pending",
                  [
                    [
                      { text: "✅ Approve", callback_data: `approve_payout:${id}` },
                      { text: "❌ Reject", callback_data: `reject_payout:${id}` },
                    ]
                  ]
                );
              }
              break;
            }

            case "reject_payout": {
              const { error } = await supabaseAdmin
                .from("payouts")
                .update({ status: "rejected", processed_at: new Date().toISOString() })
                .eq("id", id)
                .eq("status", "pending");

              if (error) {
                await answerCallbackQuery(callbackQueryId, "Error: " + error.message, true);
                break;
              }

              await sendEventEmail({ type: "payout_rejected", payoutId: id, reason: "Rejected by admin." }).catch(() => {});
              await answerCallbackQuery(callbackQueryId, "Payout rejected", false);

              if (chatId && messageId) {
                await editTelegramMessage(
                  chatId,
                  messageId,
                  cq.message.text + "\n\n<b>REJECTED</b> by Emperor",
                );
              }
              break;
            }

            // ── PHASE 2 PROGRESSION ──────────────────────────────────────

            case "approve_phase2": {
              const { data: acc } = await supabaseAdmin
                .from("trader_accounts")
                .select("id, user_id, starting_balance, currency, challenge_id, order_id, current_phase, status")
                .eq("id", id)
                .maybeSingle();

              if (!acc || (acc as any).current_phase >= 2) {
                await answerCallbackQuery(callbackQueryId, "Already processed or not found", true);
                break;
              }

              const isUsd = (acc as any).currency === "USD";
              const startingBalance = Number((acc as any).starting_balance);

              await supabaseAdmin
                .from("trader_accounts")
                .update({ status: "passed", phase1_passed_at: new Date().toISOString(), phase2_requested_at: null } as never)
                .eq("id", id);

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
                await supabaseAdmin
                  .from("trader_accounts")
                  .update({ status: "active", phase1_passed_at: null } as never)
                  .eq("id", id);

                await answerCallbackQuery(callbackQueryId, "Pool unavailable: " + poolResult.error, true);
                break;
              }

              await supabaseAdmin
                .from("trader_accounts")
                .update({ current_phase: 2, trading_days: 0 } as never)
                .eq("id", poolResult.accountId);

              await supabaseAdmin.from("notifications").insert({
                user_id: (acc as any).user_id,
                title: "Phase 1 Passed — New Account Provisioned",
                message: `Congratulations — you passed Phase 1! Your Phase 2 account is ready. New Login: ${poolResult.mt5Login} · Server: ${poolResult.mt5Server}`,
                type: "success",
              } as never);

              await sendEventEmail({ type: "phase1_passed", accountId: poolResult.accountId }).catch(() => {});

              // Post to live activity feed
              {
                const { data: profile } = await supabaseAdmin
                  .from("profiles")
                  .select("full_name")
                  .eq("id", (acc as any).user_id)
                  .maybeSingle();

                const fullName = (profile as any)?.full_name ?? "Trader";
                const avatarInitials = fullName.split(" ").slice(0, 2)
                  .map((w: string) => w[0]?.toUpperCase() ?? "").join("");

                const { data: chData } = await supabaseAdmin
                  .from("challenges")
                  .select("name")
                  .eq("id", (acc as any).challenge_id)
                  .maybeSingle();

                await supabaseAdmin.from("live_activity").insert({
                  event_type: "phase2_approved",
                  anonymized_name: fullName,
                  avatar_initials: avatarInitials,
                  challenge_name: (chData as any)?.name ?? "",
                  currency: (acc as any).currency ?? "NGN",
                  account_size: startingBalance,
                } as never);
              }

              await answerCallbackQuery(callbackQueryId, "Phase 2 provisioned!", false);

              if (chatId && messageId) {
                await editTelegramMessage(
                  chatId,
                  messageId,
                  cq.message.text + `\n\n<b>APPROVED</b> — New Login: <code>${poolResult.mt5Login}</code>`,
                );
              }
              break;
            }

            case "reject_phase2": {
              await supabaseAdmin
                .from("trader_accounts")
                .update({ phase2_requested_at: null } as never)
                .eq("id", id);

              const { data: rejAcc } = await supabaseAdmin
                .from("trader_accounts")
                .select("user_id")
                .eq("id", id)
                .maybeSingle();

              if (rejAcc?.user_id) {
                await supabaseAdmin.from("notifications").insert({
                  user_id: rejAcc.user_id,
                  title: "Phase 2 Request Rejected",
                  message: "Your Phase 2 progression request was rejected. Please contact support for more information.",
                  type: "warning",
                } as never);
              }

              await answerCallbackQuery(callbackQueryId, "Phase 2 rejected", false);

              if (chatId && messageId) {
                await editTelegramMessage(
                  chatId,
                  messageId,
                  cq.message.text + "\n\n<b>REJECTED</b> by Emperor",
                );
              }
              break;
            }

            // ── FUNDED PROGRESSION ───────────────────────────────────────

            case "approve_funded": {
              const { data: acc } = await supabaseAdmin
                .from("trader_accounts")
                .select("id, user_id, starting_balance, currency, challenge_id, order_id, current_phase, status")
                .eq("id", id)
                .maybeSingle();

              if (!acc || (acc as any).status === "funded") {
                await answerCallbackQuery(callbackQueryId, "Already processed or not found", true);
                break;
              }

              const isUsd = (acc as any).currency === "USD";
              const startingBalance = Number((acc as any).starting_balance);

              await supabaseAdmin
                .from("trader_accounts")
                .update({ status: "passed", phase2_passed_at: new Date().toISOString(), funded_requested_at: null } as never)
                .eq("id", id);

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
                await supabaseAdmin
                  .from("trader_accounts")
                  .update({ status: "active", phase2_passed_at: null } as never)
                  .eq("id", id);
                await answerCallbackQuery(callbackQueryId, "Pool unavailable: " + poolResult.error, true);
                break;
              }

              await supabaseAdmin
                .from("trader_accounts")
                .update({
                  status: "funded",
                  current_phase: 3,
                  trading_days: 0,
                  funded_at: new Date().toISOString(),
                } as never)
                .eq("id", poolResult.accountId);

              await supabaseAdmin.from("notifications").insert({
                user_id: (acc as any).user_id,
                title: "You're Funded — New Account Provisioned",
                message: `Congratulations — you are now a funded trader! Your funded account is ready. Login: ${poolResult.mt5Login} · Server: ${poolResult.mt5Server}. Start trading and request your first payout!`,
                type: "success",
              } as never);

              await sendEventEmail({ type: "funded", accountId: poolResult.accountId }).catch(() => {});

              // Post to live activity feed
              {
                const { data: profile } = await supabaseAdmin
                  .from("profiles")
                  .select("full_name")
                  .eq("id", (acc as any).user_id)
                  .maybeSingle();

                const fullName = (profile as any)?.full_name ?? "Trader";
                const avatarInitials = fullName.split(" ").slice(0, 2)
                  .map((w: string) => w[0]?.toUpperCase() ?? "").join("");

                const { data: chData } = await supabaseAdmin
                  .from("challenges")
                  .select("name")
                  .eq("id", (acc as any).challenge_id)
                  .maybeSingle();

                await supabaseAdmin.from("live_activity").insert({
                  event_type: "funded_approved",
                  anonymized_name: fullName,
                  avatar_initials: avatarInitials,
                  challenge_name: (chData as any)?.name ?? "",
                  currency: (acc as any).currency ?? "NGN",
                  account_size: startingBalance,
                } as never);
              }

              await answerCallbackQuery(callbackQueryId, "Funded!", false);

              if (chatId && messageId) {
                await editTelegramMessage(
                  chatId,
                  messageId,
                  cq.message.text + `\n\n<b>FUNDED</b> — New Login: <code>${poolResult.mt5Login}</code>`,
                );
              }
              break;
            }

            case "reject_funded": {
              await supabaseAdmin
                .from("trader_accounts")
                .update({ funded_requested_at: null } as never)
                .eq("id", id);

              const { data: rejAcc } = await supabaseAdmin
                .from("trader_accounts")
                .select("user_id")
                .eq("id", id)
                .maybeSingle();

              if (rejAcc?.user_id) {
                await supabaseAdmin.from("notifications").insert({
                  user_id: rejAcc.user_id,
                  title: "Funded Request Rejected",
                  message: "Your funded status request was rejected. Please contact support for more information.",
                  type: "warning",
                } as never);
              }

              await answerCallbackQuery(callbackQueryId, "Rejected", false);

              if (chatId && messageId) {
                await editTelegramMessage(
                  chatId,
                  messageId,
                  cq.message.text + "\n\n<b>REJECTED</b> by Emperor",
                );
              }
              break;
            }

            default:
              await answerCallbackQuery(callbackQueryId, "Unknown action", false);
          }
        } catch (e) {
          console.error("[telegram-webhook] handler error:", e);
          await answerCallbackQuery(callbackQueryId, "Server error — check admin panel", true);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
