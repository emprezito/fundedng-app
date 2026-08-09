import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail, type EmailEvent } from "@/lib/email.server";

/**
 * Authenticated email dispatcher. Client posts { event } and the server
 * verifies authorization based on the event type before sending.
 * - welcome / kyc_approved : the caller themselves
 * - purchase_confirmed / payout_requested : caller must own the referenced row
 * - everything else (admin-side) : caller must have role=admin
 */
export const Route = createFileRoute("/api/send-email")({
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
          if (authErr || !userData?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
          const callerId = userData.user.id;

          const body = (await request.json()) as { event?: EmailEvent };
          const ev = body?.event;
          if (!ev || !ev.type) return Response.json({ error: "event required" }, { status: 400 });

          const isAdmin = async () => {
            const { data: roles } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", callerId);
            return !!roles?.some((r) => r.role === "admin");
          };

          // Authorize per event
          switch (ev.type) {
            case "welcome":
            case "kyc_approved":
              if (ev.userId !== callerId && !(await isAdmin())) {
                return Response.json({ error: "Forbidden" }, { status: 403 });
              }
              break;
            case "purchase_confirmed": {
              const { data: order } = await supabaseAdmin
                .from("orders").select("user_id").eq("id", ev.orderId).maybeSingle();
              if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
              if ((order as any).user_id !== callerId && !(await isAdmin())) {
                return Response.json({ error: "Forbidden" }, { status: 403 });
              }
              break;
            }
            case "payout_requested": {
              const { data: po } = await supabaseAdmin
                .from("payouts").select("user_id").eq("id", ev.payoutId).maybeSingle();
              if (!po) return Response.json({ error: "Payout not found" }, { status: 404 });
              if ((po as any).user_id !== callerId && !(await isAdmin())) {
                return Response.json({ error: "Forbidden" }, { status: 403 });
              }
              break;
            }
            default:
              if (!(await isAdmin())) {
                return Response.json({ error: "Forbidden — admins only" }, { status: 403 });
              }
          }

          const result = await sendEventEmail(ev);
          return Response.json(result, { status: result.ok ? 200 : 500 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[api.send-email] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});