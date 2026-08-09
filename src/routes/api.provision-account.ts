import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { botProvision } from "@/lib/bot.server";
import { sendPushToUser, sendPushToAdmins } from "@/lib/push.server";
import { sendEventEmail } from "@/lib/email.server";

/**
 * Auto-provision an MT5 demo account by calling the externally-hosted
 * Exness bot. Idempotent per order. On success: stores credentials,
 * marks the order delivered, fulfills the account_request, notifies trader.
 * On failure: marks the account_request "failed" with a reason so the
 * admin can fall back to manual delivery via /api/deliver-account.
 *
 * Body: { order_id: string }
 *
 * Public CORS-friendly POST: it's safe because we look up the order by id
 * and the only side effect is provisioning at most one account per order.
 */
export const Route = createFileRoute("/api/provision-account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { order_id?: string };
          const order_id = body?.order_id;
          if (!order_id) {
            return Response.json({ error: "order_id required" }, { status: 400 });
          }

          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("*")
            .eq("id", order_id)
            .maybeSingle();
          if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
          if (order.status !== "paid" && order.status !== "delivered") {
            return Response.json({ error: `Order not paid (status=${order.status})` }, { status: 400 });
          }

          // Idempotency: account already exists for this order.
          const { data: existing } = await supabaseAdmin
            .from("trader_accounts")
            .select("id, mt5_login, mt5_server")
            .eq("order_id", order.id)
            .maybeSingle();
          if (existing) {
            return Response.json({
              ok: true,
              already: true,
              login: existing.mt5_login,
              server: existing.mt5_server,
            });
          }

          const { data: ch } = await supabaseAdmin
            .from("challenges")
            .select("*")
            .eq("id", order.challenge_id)
            .single();
          if (!ch) return Response.json({ error: "Challenge missing" }, { status: 500 });

          // Mark request as in-flight so the admin doesn't try to deliver
          // manually at the same time.
          await supabaseAdmin
            .from("account_requests")
            .update({
              status: "claimed",
              claimed_by: "bot",
              claimed_at: new Date().toISOString(),
            })
            .eq("order_id", order.id);

          let provisioned;
          try {
            provisioned = await botProvision({
              balanceNGN: ch.account_size,
              idempotencyKey: order.id,
              challengeName: ch.name,
            });
          } catch (err) {
            const reason = err instanceof Error ? err.message : "bot provision failed";
            await supabaseAdmin
              .from("account_requests")
              .update({
                status: "failed",
                failure_reason: reason.slice(0, 500),
                claimed_by: null,
              })
              .eq("order_id", order.id);
            await supabaseAdmin.from("mt5_worker_events").insert({
              event_type: "bot_provision_failed",
              worker_id: "bot",
              payload: { order_id: order.id, error: reason.slice(0, 1000) },
            });
            return Response.json({ error: reason }, { status: 502 });
          }

          const { error: insertErr } = await supabaseAdmin.from("trader_accounts").insert({
            user_id: order.user_id,
            order_id: order.id,
            challenge_id: order.challenge_id,
            mt5_login: provisioned.login,
            mt5_password: provisioned.password,
            investor_password: null,
            mt5_server: provisioned.server,
            metaapi_account_id: null,
            provider: "exness-bot",
            starting_balance: ch.account_size,
            current_equity: ch.account_size,
            current_phase: 1,
            status: "active",
          });
          if (insertErr) {
            await supabaseAdmin
              .from("account_requests")
              .update({
                status: "failed",
                failure_reason: `db insert: ${insertErr.message}`,
                claimed_by: null,
              })
              .eq("order_id", order.id);
            return Response.json({ error: insertErr.message }, { status: 500 });
          }

          await supabaseAdmin.from("orders").update({ status: "delivered" }).eq("id", order.id);
          await supabaseAdmin
            .from("account_requests")
            .update({
              status: "fulfilled",
              fulfilled_at: new Date().toISOString(),
              claimed_by: "bot",
              provider_response: { login: provisioned.login, server: provisioned.server },
            })
            .eq("order_id", order.id);
          await supabaseAdmin.from("mt5_worker_events").insert({
            event_type: "bot_provision_success",
            worker_id: "bot",
            payload: { order_id: order.id, login: provisioned.login, server: provisioned.server },
          });
          await supabaseAdmin.from("notifications").insert({
            user_id: order.user_id,
            title: "🎉 Your MT5 Account is Ready",
            message: `${ch.name} active. Login: ${provisioned.login} · Server: ${provisioned.server}. Open the dashboard to view your password.`,
            type: "welcome",
          });

           await sendPushToUser(order.user_id, {
             title: "🎉 Your MT5 Account is Ready",
             body: `${ch.name} is active. Tap to view your login.`,
             url: "/dashboard",
           });

           // Send account delivered email
           await sendEventEmail({ type: "mt5_delivered", orderId: order.id, mt5Login: provisioned.login, mt5Password: provisioned.password, mt5Server: provisioned.server }).catch((e) =>
             console.error("[provision-account] email send failed", e),
           );

           await sendPushToAdmins({
            title: "New challenge purchase",
            body: `${ch.name} delivered for order ${order.id.slice(0, 8)}…`,
            url: "/admin",
          });

          return Response.json({
            ok: true,
            login: provisioned.login,
            server: provisioned.server,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[provision-account] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
