import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;

async function sendAdminEmail(subject: string, bodyHtml: string) {
  if (!RESEND_API_KEY || !ADMIN_EMAIL) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "FundedNG <support@fundedng.fun>",
        to: [ADMIN_EMAIL],
        subject: `[Admin] ${subject}`,
        html: bodyHtml,
      }),
    });
  } catch (e) {
    console.error("[account-pool] admin email failed", e);
  }
}

async function notifyAdmins(title: string, message: string) {
  const { data: adminUsers } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (!adminUsers?.length) return;

  await supabaseAdmin.from("notifications").insert(
    adminUsers.map((r: any) => ({
      user_id: r.user_id,
      title,
      message,
      type: "warning" as const,
    })),
  );
}

/**
 * Claim an available account from the pool for a paid order.
 *
 * Atomically picks the oldest available account matching the requested size,
 * inserts a trader_accounts row, marks the order delivered, and sends
 * a low-stock alert if fewer than 3 accounts remain for that size.
 */
const MAX_CLAIM_RETRIES = 10;

export async function claimPoolAccount(args: {
  orderId: string;
  accountSizeNgn: number;
  accountSizeUsd?: number;
  currency: string;
  challengeId: string;
  userId: string;
  phaseProgression?: boolean;
}): Promise<{ ok: true; accountId: string; mt5Login: string; mt5Password: string; mt5Server: string } | { ok: false; error: string }> {
  let lastError = "No accounts available for this size. Admin has been notified.";
  const isUsd = args.currency === "USD";
  const accountSize = isUsd ? args.accountSizeUsd! : args.accountSizeNgn;
  const sizeKey = isUsd ? "account_size_usd" : "account_size_ngn";

  for (let attempt = 1; attempt <= MAX_CLAIM_RETRIES; attempt++) {
    // 1. Find oldest available account for this size and currency
    const { data: poolRows, error: poolErr } = await supabaseAdmin
      .from("account_pool")
      .select("*")
      .eq("status", "available")
      .eq("currency", args.currency)
      .eq(sizeKey, accountSize)
      .order("created_at", { ascending: true })
      .limit(1);

    if (poolErr) {
      console.error("[claimPoolAccount] query failed", poolErr);
      return { ok: false, error: "Pool lookup failed." };
    }

    const poolRow = poolRows?.[0];
    if (!poolRow) {
      if (attempt === 1) {
        const sizeLabel = isUsd ? `$${accountSize.toLocaleString("en-US")}` : `₦${accountSize.toLocaleString("en-NG")}`;
        const msg = `No ${sizeLabel} ${args.currency} account in pool for order ${args.orderId.slice(0, 8)}…`;
        await notifyAdmins("⚠️ Account Pool Empty", msg);
        await sendAdminEmail(
          "Account Pool Empty — Manual Delivery Needed",
          `<h2>Pool Empty</h2><p>${msg}</p><p><a href="${process.env.SITE ?? "https://fundedng.fun"}/admin">Go to Admin →</a></p>`,
        );
      }
      return { ok: false, error: lastError };
    }

    // 2. Optimistic lock: claim only if still available (atomic at DB level)
    const { data: updated, error: claimErr } = await supabaseAdmin
      .from("account_pool")
      .update({
        status: "assigned",
        assigned_at: new Date().toISOString(),
        assigned_order_id: args.orderId,
      })
      .eq("id", poolRow.id)
      .eq("status", "available")
      .select();

    if (claimErr) {
      console.error("[claimPoolAccount] claim failed", claimErr);
      return { ok: false, error: "Failed to claim account." };
    }

    if (!updated || updated.length === 0) {
      // Race lost — another request claimed this account first. Retry with next.
      console.warn("[claimPoolAccount] attempt %d/%d: race lost on %s, retrying…", attempt, MAX_CLAIM_RETRIES, poolRow.id);
      lastError = "Could not claim account due to high demand. Admin has been notified.";
      continue;
    }

    // 3. Create trader_accounts row
    const { data: newAccount, error: insertErr } = await supabaseAdmin
      .from("trader_accounts")
      .insert({
        user_id: args.userId,
        order_id: args.orderId,
        challenge_id: args.challengeId,
        mt5_login: poolRow.mt5_login,
        mt5_password: poolRow.mt5_password,
        investor_password: poolRow.investor_password,
        mt5_server: poolRow.mt5_server,
        provider: "pool",
        currency: args.currency,
        starting_balance: accountSize,
        current_equity: accountSize,
        current_phase: 1,
        status: "active",
      })
      .select("id")
      .single();

    if (insertErr || !newAccount) {
      // Rollback pool row to available
      await supabaseAdmin
        .from("account_pool")
        .update({
          status: "available",
          assigned_at: null,
          assigned_order_id: null,
        })
        .eq("id", poolRow.id);

      console.error("[claimPoolAccount] trader_accounts insert failed", insertErr);
      return { ok: false, error: insertErr?.message ?? "Failed to create account." };
    }

    // 4. Link pool row to the new trader account
    await supabaseAdmin
      .from("account_pool")
      .update({ assigned_account_id: newAccount.id })
      .eq("id", poolRow.id);

    // 5. Mark order delivered (skip for phase progression — order already delivered)
    if (!args.phaseProgression) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", args.orderId);

      // 6. Mark account_request as fulfilled (so it doesn't show in admin pending tab)
      // Uses upsert to avoid race with tg_orders_queue_request trigger
      await supabaseAdmin
        .from("account_requests")
        .upsert({
          order_id: args.orderId,
          user_id: args.userId,
          challenge_id: args.challengeId,
          status: "fulfilled",
          fulfilled_at: new Date().toISOString(),
          claimed_by: "pool",
          provider_response: { login: poolRow.mt5_login, server: poolRow.mt5_server },
        }, {
          onConflict: "order_id",
          ignoreDuplicates: false,
        })
        .then(({ error }) => {
          if (error) console.warn("[claimPoolAccount] account_requests upsert failed:", error.message);
        });

      // 7. Send welcome notification to trader
      await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: args.userId,
          title: "🎉 Your MT5 Account is Ready",
          message: `Your challenge account is active. Login: ${poolRow.mt5_login} · Server: ${poolRow.mt5_server}. Check your dashboard for the password.`,
          type: "welcome",
        });
    }

    // 5b. Check if stock is low for this size
    const { count: remaining } = await supabaseAdmin
      .from("account_pool")
      .select("id", { count: "exact", head: true })
      .eq("status", "available")
      .eq("currency", args.currency)
      .eq(sizeKey, accountSize);

    if (remaining !== null && remaining <= 2) {
      const sizeLabel = isUsd ? `$${accountSize.toLocaleString("en-US")}` : `₦${accountSize.toLocaleString("en-NG")}`;
      const lowMsg = `Only ${remaining} account(s) left for size ${sizeLabel}.`;
      await notifyAdmins("⚠️ Account Pool Running Low", lowMsg);
      await sendAdminEmail(
        `Low Stock: ${sizeLabel} (${remaining} left)`,
        `<h2>Pool Low Stock</h2><p>${lowMsg}</p><p><a href="${process.env.SITE ?? "https://fundedng.fun"}/admin">Go to Admin →</a></p>`,
      );
    }

    return {
      ok: true,
      accountId: newAccount.id,
      mt5Login: poolRow.mt5_login,
      mt5Password: poolRow.mt5_password,
      mt5Server: poolRow.mt5_server,
    };
  }

  // All retries exhausted — admins need to intervene
  await notifyAdmins("⚠️ Account Pool Contention", `Exhausted retries claiming pool account for order ${args.orderId.slice(0, 8)}…`);
  return { ok: false, error: lastError };
}
