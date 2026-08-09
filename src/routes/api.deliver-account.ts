import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/lib/push.server";
import { sendEventEmail } from "@/lib/email.server";

/**
 * Manual account delivery. Admin posts MT5 credentials they created by hand
 * in the broker terminal; this route stores them on trader_accounts, marks
 * the order delivered, and notifies the trader. Idempotent per order.
 *
 * Body: {
 *   order_id: string,
 *   mt5_login: string,
 *   mt5_password: string,
 *   mt5_server: string,
 *   investor_password?: string,
 * }
 */
export const Route = createFileRoute("/api/deliver-account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ---- AuthZ: admins only ----
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
          const { data: roles, error: roleErr } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id);
          if (roleErr) {
            return Response.json({ error: roleErr.message }, { status: 500 });
          }
          if (!roles?.some((r) => r.role === "admin")) {
            return Response.json(
              { error: "Forbidden — admins only" },
              { status: 403 },
            );
          }

          const body = (await request.json()) as {
            order_id?: string;
            mt5_login?: string;
            mt5_password?: string;
            mt5_server?: string;
            investor_password?: string;
          };
          const {
            order_id,
            mt5_login,
            mt5_password,
            mt5_server,
            investor_password,
          } = body;
          if (!order_id) {
            return Response.json({ error: "order_id required" }, { status: 400 });
          }
          if (!mt5_login || !mt5_password || !mt5_server) {
            return Response.json(
              { error: "mt5_login, mt5_password and mt5_server are required" },
              { status: 400 },
            );
          }

          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("*")
            .eq("id", order_id)
            .maybeSingle();
          if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

          // Idempotency: account already exists for this order.
          const { data: existing } = await supabaseAdmin
            .from("trader_accounts")
            .select("id, mt5_login")
            .eq("order_id", order.id)
            .maybeSingle();
          if (existing) {
            return Response.json({ ok: true, already: true, login: existing.mt5_login });
          }

          const { data: ch } = await supabaseAdmin
            .from("challenges")
            .select("*")
            .eq("id", order.challenge_id)
            .single();
          if (!ch) return Response.json({ error: "Challenge missing" }, { status: 500 });

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("full_name, phone")
            .eq("id", order.user_id)
            .single();

          // Persist admin-entered credentials on trader_accounts.
          const { error: insertErr } = await supabaseAdmin.from("trader_accounts").insert({
            user_id: order.user_id,
            order_id: order.id,
            challenge_id: order.challenge_id,
            mt5_login: mt5_login.trim(),
            mt5_password: mt5_password.trim(),
            investor_password: investor_password?.trim() || null,
            mt5_server: mt5_server.trim(),
            metaapi_account_id: null,
            provider: "manual",
            currency: ch.currency || "NGN",
            starting_balance: ch.account_size,
            current_equity: ch.account_size,
            current_phase: 1,
            status: "active",
          });
          if (insertErr) {
            return Response.json({ error: insertErr.message }, { status: 500 });
          }

          await supabaseAdmin
            .from("orders")
            .update({ status: "delivered" })
            .eq("id", order.id);

          await supabaseAdmin
            .from("account_requests")
            .update({
              status: "fulfilled",
              fulfilled_at: new Date().toISOString(),
              claimed_by: "manual",
              provider_response: { login: mt5_login, server: mt5_server },
            })
            .eq("order_id", order.id);

          await supabaseAdmin.from("mt5_worker_events").insert({
            event_type: "manual_delivery",
            worker_id: "manual",
            payload: { order_id: order.id, login: mt5_login },
          });

           await supabaseAdmin.from("notifications").insert({
             user_id: order.user_id,
             title: "🎉 Your MT5 Account is Ready",
             message: `${ch.name} active. Login: ${mt5_login} · Server: ${mt5_server}. Open the dashboard to view your password.`,
             type: "welcome",
           });

           await sendPushToUser(order.user_id, {
             title: "🎉 Your MT5 Account is Ready",
             body: `${ch.name} active. Tap to view your login.`,
             url: "/dashboard",
           });

           // Send account delivered email
           await sendEventEmail({ type: "mt5_delivered", orderId: order.id, mt5Login: mt5_login, mt5Password: mt5_password, mt5Server: mt5_server }).catch((e) =>
             console.error("[deliver-account] email send failed", e),
           );

          return Response.json({ ok: true, login: mt5_login, server: mt5_server });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[deliver-account] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});