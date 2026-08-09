import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(token: string) {
  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !userData?.user) return { ok: false as const };
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!roles?.some((r: any) => r.role === "admin")) return { ok: false as const };
  return { ok: true as const, userId: userData.user.id };
}

export const Route = createFileRoute("/api/admin/delete-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : null;
          if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

          const auth = await assertAdmin(token);
          if (!auth.ok) return Response.json({ error: "Forbidden" }, { status: 403 });

          const body = (await request.json()) as { request_id?: string };
          const requestId = body.request_id?.trim();
          if (!requestId) {
            return Response.json({ error: "request_id is required" }, { status: 400 });
          }

          const { data: req } = await supabaseAdmin
            .from("account_requests")
            .select("id, order_id, status")
            .eq("id", requestId)
            .maybeSingle();

          if (!req) return Response.json({ error: "Request not found" }, { status: 404 });

          if (!["pending", "failed"].includes(req.status)) {
            return Response.json({ error: "Can only delete pending or failed requests" }, { status: 400 });
          }

          const { error: delErr } = await supabaseAdmin
            .from("account_requests")
            .delete()
            .eq("id", requestId);

          if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

          if (req.order_id) {
            await supabaseAdmin
              .from("orders")
              .update({ status: "cancelled" })
              .eq("id", req.order_id);
          }

          return Response.json({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[api.admin.delete-request] POST unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
