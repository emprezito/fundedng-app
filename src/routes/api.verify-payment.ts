import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";
import { claimPoolAccount } from "@/lib/account-pool.server";
import { getUSDRate } from "@/lib/exchange-rate.server";
import { sendMetaEvent } from "@/lib/fb-capi.server";
import { computeBreachReset, provisionBreachReset } from "@/lib/breach-reset.server";

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined
  );
}

/**
 * Server-side Squad verification.
 *
 * The browser cannot be trusted to confirm payment success — anyone could
 * fabricate an `onSuccess` payload and create a paid order. This endpoint:
 *  1. Authenticates the caller via their Supabase access token.
 *  2. Asks Squad directly whether the transaction reference succeeded.
 *  3. Confirms the kobo amount matches the challenge price on file.
 *  4. Inserts the order with the service-role client (bypassing RLS but
 *     scoped to the verified user_id).
 *
 * Idempotent: a duplicate reference returns the existing order.
 */
export const Route = createFileRoute("/api/verify-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ---- 1. Authenticate caller ----
          const authHeader = request.headers.get("authorization");
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : null;
          if (!token) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const { data: userData, error: authErr } =
            await supabaseAdmin.auth.getUser(token);
          if (authErr || !userData?.user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const userId = userData.user.id;

          // ---- 2. Parse + validate body ----
          const body = (await request.json().catch(() => ({}))) as {
            reference?: string;
            challenge_id?: string;
            discount_percent?: string;
            discount_code?: string;
            partner_promo_code?: string;
            original_amount?: string;
            reset_account_id?: string;
            fbp?: string;
            fbc?: string;
          };
          const reference = body.reference?.trim();
          const challengeId = body.challenge_id?.trim();
          const resetAccountId = body.reset_account_id?.trim() || null;
          if (!reference || !challengeId) {
            return Response.json(
              { error: "reference and challenge_id are required" },
              { status: 400 },
            );
          }

          // ---- 3. Idempotency: existing order for this reference ----
          const { data: existing } = await supabaseAdmin
            .from("orders")
            .select("id, user_id")
            .eq("paystack_reference", reference)
            .maybeSingle();
          if (existing) {
            if (existing.user_id !== userId) {
              return Response.json(
                { error: "Payment reference already used" },
                { status: 409 },
              );
            }
            return Response.json({ ok: true, order_id: existing.id, already: true });
          }

          // ---- 4. Verify with Squad ----
          const squadSecret = process.env.SQUAD_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;
          if (!squadSecret) {
            console.error("[verify-payment] SQUAD_SECRET_KEY missing");
            return Response.json(
              { error: "Payment verification is not configured" },
              { status: 500 },
            );
          }
          const squadRes = await fetch(
            `https://api-d.squadco.com/transaction/verify/${encodeURIComponent(reference)}`,
            { headers: { Authorization: `Bearer ${squadSecret}` } },
          );
          const squadJson = (await squadRes.json().catch(() => ({}))) as {
            status?: number;
            success?: boolean;
            message?: string;
            data?: {
              transaction_status?: string;
              transaction_amount?: number;
              transaction_currency_id?: string;
            };
          };
          if (!squadRes.ok || squadJson.status !== 200 || squadJson.data?.transaction_status?.toLowerCase() !== "success") {
            return Response.json(
              { error: squadJson.message ?? "Payment not successful" },
              { status: 400 },
            );
          }

          // ---- 5. Confirm amount matches challenge price ----
          const { data: challenge, error: chErr } = await supabaseAdmin
            .from("challenges")
              .select("id, name, price_naira, usd_price, currency, is_active, account_size")
            .eq("id", challengeId)
            .maybeSingle();
          if (chErr || !challenge) {
            return Response.json({ error: "Challenge not found" }, { status: 404 });
          }
          const orderCurrency = challenge.currency || "NGN";
          let effectivePriceNaira: number;
          if (orderCurrency === "USD") {
            const usdPrice = Number(challenge.usd_price || 0);
            const rate = await getUSDRate();
            effectivePriceNaira = Math.ceil(usdPrice * rate);
          } else {
            effectivePriceNaira = Number(challenge.price_naira);
          }

          // Breach Reset: fee is a fraction of the challenge price (phase 2) or
          // account size (funded); no discount applies.
          if (resetAccountId) {
            const q = await computeBreachReset(resetAccountId);
            if (!q.ok) return Response.json({ error: q.error }, { status: 400 });
            if (!q.kind || q.account.user_id !== userId) {
              return Response.json({ error: "Account not eligible for reset" }, { status: 400 });
            }
            const rate = await getUSDRate();
            effectivePriceNaira = q.isUsd
              ? Math.ceil(q.feeInCurrency * rate)
              : Math.round(q.feeInCurrency);
          }

          const discountPercent = resetAccountId
            ? 0
            : Math.max(0, Math.min(100, Number(body.discount_percent ?? 0) || 0));
          const discountCode = resetAccountId ? null : (body.discount_code?.trim() || null);
          const partnerPromoCode = resetAccountId ? null : (body.partner_promo_code?.trim() || null);
          const originalKobo = effectivePriceNaira * 100;
          const discountKobo = Math.floor(originalKobo * discountPercent / 100);
          const expectedKobo = Math.max(0, originalKobo - discountKobo);
          const paidKobo = Number(squadJson.data?.transaction_amount ?? 0);
          if (paidKobo !== expectedKobo) {
            return Response.json(
              {
                error: `Amount mismatch: expected ${expectedKobo} kobo, got ${paidKobo}`,
              },
              { status: 400 },
            );
          }

          // ---- 6. Create order (service role, scoped to verified user) ----
          const { data: order, error: orderErr } = await supabaseAdmin
            .from("orders")
            .insert({
              user_id: userId,
              challenge_id: challengeId,
              currency: orderCurrency,
              original_amount: originalKobo,
              discount_amount: discountKobo,
              discount_code: discountCode,
              discount_percent: discountPercent,
              partner_promo_code: partnerPromoCode,
              amount_paid: paidKobo,
              status: "paid",
              paystack_reference: reference,
              reset_account_id: resetAccountId,
            })
            .select("id")
            .single();
          if (orderErr || !order) {
            return Response.json(
              { error: orderErr?.message ?? "Order creation failed" },
              { status: 500 },
            );
          }

          // Meta Conversions API: Purchase (dedup-matched with the pixel event
          // fired in payment.callback.tsx, which uses the same event_id).
          void sendMetaEvent({
            eventName: "Purchase",
            eventId: `purchase_${order.id}`,
            value: paidKobo / 100,
            currency: "NGN",
            email: userData.user.email,
            externalId: userId,
            fbp: body.fbp,
            fbc: body.fbc,
            sourceUrl: `${request.headers.get("origin") || new URL(request.url).origin}/payment/callback`,
            clientIp: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          }).catch((e) => console.error("[verify-payment] meta Purchase failed", e));

           if (discountCode) {
             await supabaseAdmin.rpc("increment_discount_redemption" as never, { _code: discountCode } as never);
           }

             // ---- 7. Try to deliver from pool automatically ----
            let poolResult: {
              ok: boolean;
              mt5Login?: string;
              mt5Password?: string;
              mt5Server?: string;
              error?: string;
            } | null = null;

            if (resetAccountId) {
              const r = await provisionBreachReset({
                orderId: order.id,
                accountId: resetAccountId,
                userId,
              }).catch((e) => {
                console.error("[verify-payment] provisionBreachReset threw", e);
                return { ok: false as const, error: e instanceof Error ? e.message : "Reset provisioning failed" };
              });
              poolResult = r.ok ? { ok: true, mt5Login: r.mt5Login } : { ok: false, error: r.error };
            } else {
              poolResult = await claimPoolAccount({
                orderId: order.id,
                accountSizeNgn: orderCurrency === "USD" ? 0 : challenge.account_size,
                accountSizeUsd: orderCurrency === "USD" ? challenge.account_size : undefined,
                currency: orderCurrency,
                challengeId: challenge.id,
                userId,
                phase: 1,
              }).catch((e) => {
                console.error("[verify-payment] claimPoolAccount threw", e);
                return null;
              });
            }


           // Fetch profile for Telegram / logs
           const { data: prof } = await supabaseAdmin
             .from("profiles")
             .select("full_name")
             .eq("id", userId)
             .maybeSingle();
           const traderName = prof?.full_name || "A trader";
           const chName = challenge.name;
           const chSize = challenge.account_size;
           const currencySymbol = orderCurrency === "USD" ? "$" : "₦";

            if (poolResult?.ok) {
              // Verify the account was actually created
              const { data: verifyAccount } = await supabaseAdmin
                .from("trader_accounts")
                .select("id")
                .eq("order_id", order.id)
                .maybeSingle();

              if (!verifyAccount) {
                console.error("[verify-payment] CRITICAL: pool returned ok but no trader_account found for order", order.id);
                try {
                  await supabaseAdmin.rpc("send_telegram" as never, {
                    p_message: `🚨 PROVISIONING FAILURE\nOrder: ${order.id}\nTrader: ${traderName}\nPool returned ok but no account created. Manual delivery needed.`,
                  } as never);
                } catch (_) { /* ignore */ }
              } else {
                if (!resetAccountId) {
                  await sendEventEmail({
                    type: "mt5_delivered",
                    orderId: order.id,
                    mt5Login: poolResult.mt5Login,
                    mt5Password: poolResult.mt5Password,
                    mt5Server: poolResult.mt5Server,
                  }).catch((e) => console.error("[verify-payment] delivery email failed", e));

                  try {
                    await supabaseAdmin.rpc("send_telegram" as never, {
                      p_message: `✅ <b>New Purchase — Auto-Delivered</b>\nTrader: ${traderName}\nChallenge: ${chName}\nSize: ${currencySymbol}${chSize?.toLocaleString("en-NG")}\nLogin: ${poolResult.mt5Login}\nServer: ${poolResult.mt5Server}`,
                    } as never);
                  } catch (e) {
                    console.error("[verify-payment] telegram send failed", e);
                  }
                }
              }
            } else {
             // Pool empty or error — order stays "paid" for manual delivery.
             // claimPoolAccount already notified admins. Still send purchase receipt.
             console.warn("[verify-payment] pool claim failed", poolResult?.error ?? "unexpected");

              try {
                await supabaseAdmin.rpc("send_telegram" as never, {
                  p_message: `⏳ <b>New Purchase — Manual Delivery Needed</b>\nTrader: ${traderName}\nChallenge: ${chName}\nSize: ${currencySymbol}${chSize?.toLocaleString("en-NG")}\nReason: ${poolResult?.error ?? "Pool unavailable"}`,
                } as never);
             } catch (e) {
               console.error("[verify-payment] telegram send failed", e);
             }
           }

           // Send purchase confirmed email
           await sendEventEmail({ type: "purchase_confirmed", orderId: order.id }).catch((e) =>
             console.error("[verify-payment] purchase email failed", e),
           );

           return Response.json({ ok: true, order_id: order.id, auto_delivered: poolResult?.ok ?? false, amount_naira: paidKobo / 100 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Verification failed";
          console.error("[verify-payment] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});