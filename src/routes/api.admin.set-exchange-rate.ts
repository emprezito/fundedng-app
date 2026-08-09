import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setUSDRate } from "@/lib/exchange-rate.server";

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

export const Route = createFileRoute("/api/admin/set-exchange-rate")({
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

          const body = (await request.json()) as { rate?: number };
          const rate = body.rate;
          if (!rate || rate <= 0) {
            return Response.json({ error: "Rate must be a positive number" }, { status: 400 });
          }

          await setUSDRate(rate);

          return Response.json({ ok: true, rate });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[api.admin.set-exchange-rate] POST unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
