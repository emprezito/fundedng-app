import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToAdmins } from "@/lib/push.server";
import { sendEventEmail } from "@/lib/email.server";

/**
 * Called by the buy flow after a successful Paystack payment.
 * Looks up the order + challenge and pushes a notification to all admins
 * so they can deliver the MT5 account manually.
 */
export const Route = createFileRoute("/api/notify-new-purchase")({
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
            .select("id, user_id, challenge_id")
            .eq("id", order_id)
            .maybeSingle();
          if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

          const { data: ch } = await supabaseAdmin
            .from("challenges")
            .select("name, price_naira")
            .eq("id", order.challenge_id)
            .maybeSingle();

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", order.user_id)
            .maybeSingle();

          const traderName = profile?.full_name || "A trader";
          const chName = ch?.name || "Challenge";

          await sendPushToAdmins({
            title: "💰 New challenge purchase",
            body: `${traderName} bought ${chName} — deliver manually in /admin`,
            url: "/admin",
          });

          // Send purchase confirmed email
          await sendEventEmail({ type: "purchase_confirmed", orderId: order.id }).catch((e) =>
            console.error("[notify-new-purchase] email send failed", e),
          );

          return Response.json({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[notify-new-purchase] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});