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

export const Route = createFileRoute("/api/admin/pool")({
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

          const body = (await request.json()) as {
            action?: string;
            // add
            mt5_login?: string;
            mt5_password?: string;
            investor_password?: string;
            mt5_server?: string;
            account_size_ngn?: number;
            notes?: string;
            // archive
            id?: string;
          };

          if (body.action === "add") {
            const { mt5_login, mt5_password, investor_password, mt5_server, account_size_ngn, account_size_usd, currency, notes } = body;
            const poolCurrency = currency || "NGN";
            if (!mt5_login || !mt5_password || !investor_password) {
              return Response.json(
                { error: "mt5_login, mt5_password, and investor_password are required" },
                { status: 400 },
              );
            }
            if (poolCurrency === "USD" && !account_size_usd) {
              return Response.json(
                { error: "account_size_usd is required for USD accounts" },
                { status: 400 },
              );
            }
            if (poolCurrency !== "USD" && !account_size_ngn) {
              return Response.json(
                { error: "account_size_ngn is required for NGN accounts" },
                { status: 400 },
              );
            }

            const { data, error } = await supabaseAdmin
              .from("account_pool")
              .insert({
                mt5_login: mt5_login.trim(),
                mt5_password: mt5_password.trim(),
                investor_password: investor_password.trim(),
                mt5_server: (mt5_server ?? "Exness-MT5Trial9").trim(),
                account_size_ngn: poolCurrency === "USD" ? null : (account_size_ngn ?? null),
                account_size_usd: poolCurrency === "USD" ? (account_size_usd ?? null) : null,
                currency: poolCurrency,
                notes: notes?.trim() ?? null,
              })
              .select("id")
              .single();

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ ok: true, id: data.id });
          }

          if (body.action === "archive") {
            if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

            const { data: existing } = await supabaseAdmin
              .from("account_pool")
              .select("status")
              .eq("id", body.id)
              .maybeSingle();

            if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
            if (existing.status !== "available") {
              return Response.json({ error: "Can only archive available accounts" }, { status: 400 });
            }

            const { error } = await supabaseAdmin
              .from("account_pool")
              .update({ status: "archived" })
              .eq("id", body.id);

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ ok: true });
          }

          if (body.action === "delete") {
            if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

            const { error } = await supabaseAdmin
              .from("account_pool")
              .delete()
              .eq("id", body.id);

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ ok: true });
          }

          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[api.admin.pool] POST unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },

      GET: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : null;
          if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

          const auth = await assertAdmin(token);
          if (!auth.ok) return Response.json({ error: "Forbidden" }, { status: 403 });

          const url = new URL(request.url);
          const variant = url.searchParams.get("variant");

          if (variant === "stats") {
            // Group available accounts by size (both NGN and USD)
            const { data: available, error: availErr } = await supabaseAdmin
              .from("account_pool")
              .select("account_size_ngn, account_size_usd, currency")
              .eq("status", "available");

            if (availErr) return Response.json({ error: availErr.message }, { status: 500 });

            const inventory: Record<string, number> = {};
            for (const row of available ?? []) {
              const key = row.currency === "USD"
                ? `usd_${row.account_size_usd}`
                : `ngn_${row.account_size_ngn}`;
              inventory[key] = (inventory[key] ?? 0) + 1;
            }

            // All pool rows for the table view
            const { data: allRows, error: allErr } = await supabaseAdmin
              .from("account_pool")
              .select("*")
              .order("created_at", { ascending: false });

            if (allErr) return Response.json({ error: allErr.message }, { status: 500 });

            return Response.json({ ok: true, inventory, rows: allRows ?? [] });
          }

          // Default: return all pool rows
          const { data: rows, error } = await supabaseAdmin
            .from("account_pool")
            .select("*")
            .order("created_at", { ascending: false });

          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true, rows: rows ?? [] });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "fail";
          console.error("[api.admin.pool] GET unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
