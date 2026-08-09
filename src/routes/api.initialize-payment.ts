import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";
import { claimPoolAccount } from "@/lib/account-pool.server";
import { getUSDRate } from "@/lib/exchange-rate.server";

/**
 * Server-side Squad initialization for the redirect checkout flow.
 *
 * Authenticates the caller, looks up the challenge price on the server (so
 * the browser can't tamper with it), then asks Squad to create a
 * transaction and returns the hosted `checkout_url` for the client to
 * redirect to. After payment Squad redirects back to `callback_url`, where
 * `/payment/callback` calls `/api/verify-payment` to finalize the order.
 */
export const Route = createFileRoute("/api/initialize-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : null;
          if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

          const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
          if (authErr || !userData?.user?.email) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const user = userData.user;

          const body = (await request.json().catch(() => ({}))) as { challenge_id?: string; discount_code?: string; partner_promo_code?: string; currency?: string; exchange_rate?: number };
          const challengeId = body.challenge_id?.trim();
          if (!challengeId) {
            return Response.json({ error: "challenge_id is required" }, { status: 400 });
          }

          const { data: challenge, error: chErr } = await supabaseAdmin
            .from("challenges")
            .select("id, name, price_naira, usd_price, currency, is_active, account_size")
            .eq("id", challengeId)
            .maybeSingle();
          if (chErr || !challenge || !challenge.is_active) {
            return Response.json({ error: "Challenge not available" }, { status: 404 });
          }

          const orderCurrency = body.currency || challenge.currency || "NGN";
          let effectivePriceNaira: number;
          if (orderCurrency === "USD") {
            const usdPrice = Number(challenge.usd_price || 0);
            const rate = body.exchange_rate || await getUSDRate();
            effectivePriceNaira = Math.ceil(usdPrice * rate);
          } else {
            effectivePriceNaira = Number(challenge.price_naira);
          }

          // Prefer an explicit public site URL (set PUBLIC_SITE_URL secret to
          // e.g. https://fundedng.lovable.app) so Paystack never redirects to
          // localhost or a sandbox preview URL. Fall back to the browser's
          // Origin/Referer header, then finally to the request URL.
          const headerOrigin = request.headers.get("origin");
          const referer = request.headers.get("referer");
          let origin =
            process.env.PUBLIC_SITE_URL?.trim() ||
            headerOrigin ||
            (referer ? new URL(referer).origin : "") ||
            new URL(request.url).origin;
          // Hard guard: never send Squad a localhost callback in production.
          if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(origin)) {
            origin = process.env.PUBLIC_SITE_URL?.trim() || origin;
          }
          const reference = `FNG-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
          const originalAmountNaira = effectivePriceNaira;
          let discountCode: string | null = null;
          let partnerPromoCode: string | null = null;
          let promoPercent = 0;
          let partnerPercent = 0;

          if (body.discount_code?.trim()) {
            const code = body.discount_code.trim().toUpperCase();
            const { data: promoRows } = await supabaseAdmin.rpc("validate_discount_code" as never, { _code: code, _challenge_id: challengeId } as never) as any;
            const promo = Array.isArray(promoRows) ? promoRows[0] : null;
            if (promo) {
              discountCode = promo.code;
              promoPercent = Number(promo.percent_off) || 0;
            }
          }

          if (body.partner_promo_code?.trim()) {
            const code = body.partner_promo_code.trim().toUpperCase();
            const { data: partner } = await supabaseAdmin
              .from("partner_profiles")
              .select("promo_code")
              .eq("promo_code", code)
              .eq("is_active", true)
              .maybeSingle();
            if (partner) {
              partnerPromoCode = code;
              partnerPercent = 15;
            }
          }

          if (!partnerPercent) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("partner_referred_by")
              .eq("id", user.id)
              .maybeSingle();
            if (prof?.partner_referred_by) {
              const { data: partner } = await supabaseAdmin
                .from("partner_profiles")
                .select("promo_code")
                .eq("user_id", prof.partner_referred_by)
                .eq("is_active", true)
                .maybeSingle();
              if (partner) {
                partnerPromoCode = partner.promo_code;
                partnerPercent = 15;
              }
            }
          }

          const discountPercent = promoPercent > 0 ? promoPercent : partnerPercent;
          const discountAmountNaira = Math.floor(originalAmountNaira * discountPercent / 100);
          const amountKobo = Math.max(0, originalAmountNaira - discountAmountNaira) * 100;

          // 100 % discount → free order: skip Squad entirely
          if (amountKobo <= 0) {
            const { data: order, error: orderErr } = await supabaseAdmin
              .from("orders")
              .insert({
                user_id: user.id,
                challenge_id: challengeId,
                original_amount: originalAmountNaira * 100,
                discount_amount: discountAmountNaira * 100,
                discount_code: discountCode,
                discount_percent: discountPercent,
                partner_promo_code: partnerPromoCode,
                amount_paid: 0,
                status: "paid",
                paystack_reference: reference,
                currency: orderCurrency,
              })
              .select("id")
              .single();
            if (orderErr || !order) {
              return Response.json(
                { error: orderErr?.message ?? "Order creation failed" },
                { status: 500 },
              );
            }

            if (discountCode) {
              await supabaseAdmin.rpc("increment_discount_redemption" as never, { _code: discountCode } as never);
            }

            // Auto-deliver from pool for free orders too
            const poolResult = await claimPoolAccount({
              orderId: order.id,
              accountSizeNgn: orderCurrency === "USD" ? 0 : challenge.account_size,
              accountSizeUsd: orderCurrency === "USD" ? challenge.account_size : undefined,
              currency: orderCurrency,
              challengeId: challenge.id,
              userId: user.id,
            }).catch((e) => {
              console.error("[initialize-payment] claimPoolAccount threw", e);
              return null;
            });

            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("full_name")
              .eq("id", user.id)
              .maybeSingle();
            const traderName = prof?.full_name || user.email || "A trader";

            const currencySymbol = orderCurrency === "USD" ? "$" : "₦";
            if (poolResult?.ok) {
              try {
                await supabaseAdmin.rpc("send_telegram" as never, {
                  p_message: `✅ <b>Free Purchase — Auto-Delivered</b>\nTrader: ${traderName}\nChallenge: ${challenge.name}\nSize: ${currencySymbol}${challenge.account_size?.toLocaleString("en-NG")}\nLogin: ${poolResult.mt5Login}\nServer: ${poolResult.mt5Server}`,
                } as never);
              } catch (e) {
                console.error("[initialize-payment] telegram send failed", e);
              }
            } else {
              try {
                await supabaseAdmin.rpc("send_telegram" as never, {
                  p_message: `⏳ <b>Free Purchase — Manual Delivery Needed</b>\nTrader: ${traderName}\nChallenge: ${challenge.name}\nSize: ${currencySymbol}${challenge.account_size?.toLocaleString("en-NG")}\nReason: ${poolResult?.error ?? "Pool unavailable"}`,
                } as never);
              } catch (e) {
                console.error("[initialize-payment] telegram send failed", e);
              }
            }

            await sendEventEmail({ type: "purchase_confirmed", orderId: order.id }).catch((e) =>
              console.error("[initialize-payment] email send failed", e),
            );

            return Response.json({ ok: true, free: true, order_id: order.id, reference, auto_delivered: poolResult?.ok ?? false });
          }

          const squadSecret = process.env.SQUAD_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;
          if (!squadSecret) {
            console.error("[initialize-payment] SQUAD_SECRET_KEY missing");
            return Response.json({ error: "Payment is not configured" }, { status: 500 });
          }

          // Fetch customer name for Squad's required customer_name field
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
          const customerName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Customer";

          const callbackParams = new URLSearchParams({
            challenge_id: challengeId,
            dp: String(discountPercent),
            oa: String(originalAmountNaira * 100),
          });
          if (discountCode) callbackParams.set("dc", discountCode);
          if (partnerPromoCode) callbackParams.set("pp", partnerPromoCode);

          const initRes = await fetch("https://api-d.squadco.com/transaction/initiate", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${squadSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: amountKobo,
              email: user.email,
              currency: "NGN",
              initiate_type: "inline",
              transaction_ref: reference,
              customer_name: customerName,
              callback_url: `${origin}/payment/callback?${callbackParams.toString()}`,
              payment_channels: ["transfer"],
              metadata: {
                challenge_id: challenge.id,
                challenge_name: challenge.name,
                user_id: user.id,
              },
            }),
          });

          const initJson = (await initRes.json().catch(() => ({}))) as {
            status?: number;
            message?: string;
            data?: { checkout_url?: string; transaction_ref?: string };
          };

          if (!initRes.ok || initJson.status !== 200 || !initJson.data?.checkout_url) {
            console.error("[initialize-payment] Squad raw response:", JSON.stringify(initJson));
            return Response.json(
              { error: JSON.stringify(initJson) },
              { status: 400 },
            );
          }

          return Response.json({
            ok: true,
            authorization_url: initJson.data.checkout_url,
            reference: initJson.data.transaction_ref ?? reference,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Initialization failed";
          console.error("[initialize-payment] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});