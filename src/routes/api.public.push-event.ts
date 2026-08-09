import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser, sendPushToAdmins } from "@/lib/push.server";

/**
 * Public webhook bridge for DB triggers (pg_net) → web push.
 *
 * Auth: shared secret in `x-webhook-secret` header, compared against the
 * PUSH_WEBHOOK_SECRET runtime env var. The same secret is stored in Postgres
 * (app.settings.push_webhook_secret) so triggers can send it.
 *
 * Body: {
 *   event: "payout_approved" | "payout_paid" | "phase_passed" | "account_breached" | "account_funded",
 *   user_id?: string,        // target trader (optional for admin-only events)
 *   admins?: boolean,        // also notify admins
 *   title: string,
 *   body: string,
 *   url?: string,
 * }
 */
export const Route = createFileRoute("/api/public/push-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = process.env.PUSH_WEBHOOK_SECRET;
          if (!secret) {
            return Response.json({ error: "webhook not configured" }, { status: 500 });
          }
          const provided = request.headers.get("x-webhook-secret");
          if (!provided || provided !== secret) {
            return Response.json({ error: "unauthorized" }, { status: 401 });
          }

          const body = (await request.json()) as {
            event?: string;
            user_id?: string;
            admins?: boolean;
            title?: string;
            body?: string;
            url?: string;
          };

          if (!body.title || !body.body) {
            return Response.json({ error: "title and body required" }, { status: 400 });
          }
          if (!body.user_id && !body.admins) {
            return Response.json({ error: "user_id or admins required" }, { status: 400 });
          }

          const payload = {
            title: body.title.slice(0, 120),
            body: body.body.slice(0, 280),
            url: body.url ?? "/dashboard",
          };

          if (body.user_id) {
            await sendPushToUser(body.user_id, payload);
            // Also persist a notification row if the event is user-facing.
            await supabaseAdmin.from("notifications").insert({
              user_id: body.user_id,
              title: payload.title,
              message: payload.body,
              type: body.event ?? "info",
            });
          }
          if (body.admins) {
            await sendPushToAdmins(payload);
          }

          return Response.json({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[push-event] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});