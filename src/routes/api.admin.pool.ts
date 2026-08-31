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
            account_size_usd?: number;
            currency?: string;
            phase?: number;
            funded_tier?: number;
            notes?: string;
            // archive / delete
            id?: string;
            // bulk_add
            accounts?: Array<{ mt5_login: string; mt5_password: string; investor_password: string; mt5_server?: string; account_size_ngn?: number; account_size_usd?: number; currency?: string; phase?: number; funded_tier?: number; notes?: string }>;
          };

          if (body.action === "add") {
            const { mt5_login, mt5_password, investor_password, mt5_server, account_size_ngn, account_size_usd, currency, phase, funded_tier, notes } = body;
            const poolCurrency = currency || "NGN";
            const poolPhase = phase && [1, 2, 3].includes(phase) ? phase : 1;
            const poolFundedTier = poolPhase === 3 && funded_tier ? Math.max(1, Math.floor(funded_tier)) : undefined;
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
                phase: poolPhase,
                funded_tier: poolFundedTier ?? null,
                notes: notes?.trim() ?? null,
              })
              .select("id")
              .single();

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ ok: true, id: data.id });
          }

          if (body.action === "bulk_add") {
            const { accounts, phase, funded_tier } = body;
            const poolPhase = phase && [1, 2, 3].includes(phase) ? phase : 1;
            const poolFundedTier = poolPhase === 3 && funded_tier ? Math.max(1, Math.floor(funded_tier)) : undefined;
            if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
              return Response.json({ error: "accounts array is required" }, { status: 400 });
            }

            const rows = accounts.map((a) => {
              const currency = a.currency || "NGN";
              const acctPhase = (a.phase && [1, 2, 3].includes(a.phase) ? a.phase : poolPhase);
              const acctTier = acctPhase === 3
                ? Math.max(1, Math.floor(a.funded_tier ?? poolFundedTier ?? 1))
                : undefined;
              return {
                mt5_login: a.mt5_login.trim(),
                mt5_password: a.mt5_password.trim(),
                investor_password: a.investor_password.trim(),
                mt5_server: (a.mt5_server ?? "Exness-MT5Trial9").trim(),
                account_size_ngn: currency === "USD" ? null : (a.account_size_ngn ?? null),
                account_size_usd: currency === "USD" ? (a.account_size_usd ?? null) : null,
                currency,
                phase: acctPhase,
                funded_tier: acctTier ?? null,
                notes: a.notes?.trim() ?? null,
              };
            });

            const { data, error } = await supabaseAdmin
              .from("account_pool")
              .insert(rows)
              .select("id");

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ ok: true, count: data?.length ?? 0 });
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
            // Group available accounts by size and phase
            const { data: available, error: availErr } = await supabaseAdmin
              .from("account_pool")
              .select("account_size_ngn, account_size_usd, currency, phase")
              .eq("status", "available");

            if (availErr) return Response.json({ error: availErr.message }, { status: 500 });

            // inventory[challengeKey][phase] = count
            const inventory: Record<string, Record<number, number>> = {};
            for (const row of available ?? []) {
              const key = row.currency === "USD"
                ? `usd_${row.account_size_usd}`
                : `ngn_${row.account_size_ngn}`;
              if (!inventory[key]) inventory[key] = {};
              inventory[key][row.phase] = (inventory[key][row.phase] ?? 0) + 1;
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
