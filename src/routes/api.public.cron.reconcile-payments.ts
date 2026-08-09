import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { claimPoolAccount } from "@/lib/account-pool.server";
import { sendEventEmail } from "@/lib/email.server";

export const Route = createFileRoute("/api/public/cron/reconcile-payments")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => reconcilePayments(request),
    },
  },
});

async function attemptDelivery(orderId: string, userId: string, challengeId: string) {
  const { data: challenge } = await supabaseAdmin
    .from("challenges")
    .select("id, name, account_size")
    .eq("id", challengeId)
    .maybeSingle();

  if (!challenge) return;

  const poolResult = await claimPoolAccount({
    orderId,
    accountSizeNgn: challenge.account_size,
    currency: challenge.currency ?? "NGN",
    challengeId: challenge.id,
    userId,
  }).catch(() => null);

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const traderName = prof?.full_name ?? "A trader";

  if (poolResult?.ok) {
    await sendEventEmail({
      type: "mt5_delivered",
      orderId,
      mt5Login: poolResult.mt5Login,
      mt5Password: poolResult.mt5Password,
      mt5Server: poolResult.mt5Server,
    }).catch(() => {});

    await supabaseAdmin.rpc("send_telegram" as never, {
      p_message: `✅ <b>Reconciliation Delivery</b>\nTrader: ${traderName}\nChallenge: ${challenge.name}\nLogin: ${poolResult.mt5Login}\nServer: ${poolResult.mt5Server}`,
    } as never).catch(() => {});
  } else {
    await supabaseAdmin.rpc("send_telegram" as never, {
      p_message: `⏳ <b>Reconciliation — Manual Delivery Needed</b>\nTrader: ${traderName}\nChallenge: ${challenge.name}\nOrder: ${orderId}\nReason: ${poolResult?.error ?? "Pool unavailable"}`,
    } as never).catch(() => {});
  }
}

async function pollSquadTransactions(squadSecret: string) {
  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000); // last hour

  const queryUrl = new URL("https://api-d.squadco.com/transaction/query");
  queryUrl.searchParams.set("page", "1");
  queryUrl.searchParams.set("perPage", "50");
  queryUrl.searchParams.set("from", from.toISOString());
  queryUrl.searchParams.set("to", now.toISOString());

  const res = await fetch(queryUrl.toString(), {
    headers: { Authorization: `Bearer ${squadSecret}` },
  });

  if (!res.ok) {
    console.error("[reconcile-payments] Squad query failed:", res.status);
    return [];
  }

  const json = await res.json().catch(() => ({}));
  const transactions = Array.isArray(json?.data) ? json.data : Array.isArray(json?.records) ? json.records : [];

  const created: Array<{ reference: string; orderId: string }> = [];

  for (const tx of transactions) {
    const reference = tx.transaction_ref;
    const txStatus = (tx.transaction_status ?? "").toLowerCase();
    if (!reference || txStatus !== "success") continue;

    const { data: existing } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (existing) continue;

    // Resolve metadata (user_id + challenge_id) from the list response or verify endpoint
    let userId = tx.meta?.user_id ?? tx.metadata?.user_id;
    let challengeId = tx.meta?.challenge_id ?? tx.metadata?.challenge_id;

    if (!userId || !challengeId) {
      const verifyRes = await fetch(
        `https://api-d.squadco.com/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${squadSecret}` } },
      );
      const verifyJson = await verifyRes.json().catch(() => ({}));
      const vData = verifyJson?.data;
      if (vData?.meta) {
        userId = userId || vData.meta.user_id;
        challengeId = challengeId || vData.meta.challenge_id;
      }
      if (!userId) userId = vData?.meta?.user_id ?? tx.meta?.user_id ?? tx.metadata?.user_id;
      if (!challengeId) challengeId = vData?.meta?.challenge_id ?? tx.meta?.challenge_id ?? tx.metadata?.challenge_id;
    }

    if (!userId || !challengeId) {
      console.warn(`[reconcile-payments] Cannot resolve user/challenge for ${reference} — notifying admin`);
      await supabaseAdmin.rpc("send_telegram" as never, {
        p_message: `⚠️ <b>Unresolved Squad Payment</b>\nRef: ${reference}\nAmount: ${(tx.transaction_amount ?? 0) / 100} NGN\nEmail: ${tx.email ?? "N/A"}\nNo metadata — manual check needed.`,
      } as never).catch(() => {});
      continue;
    }

    const { data: challenge } = await supabaseAdmin
      .from("challenges")
      .select("id, name, account_size, price_naira")
      .eq("id", challengeId)
      .maybeSingle();

    if (!challenge) {
      console.warn(`[reconcile-payments] Challenge ${challengeId} not found for ${reference}`);
      continue;
    }

    const amountPaid = Number(tx.transaction_amount ?? 0);
    const originalKobo = Number(challenge.price_naira) * 100;

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        challenge_id: challengeId,
        original_amount: originalKobo,
        discount_amount: Math.max(0, originalKobo - amountPaid),
        amount_paid: amountPaid,
        status: "paid",
        paystack_reference: reference,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error(`[reconcile-payments] Order creation failed for ${reference}:`, orderErr?.message);
      continue;
    }

    await supabaseAdmin.rpc("send_telegram" as never, {
      p_message: `🔄 <b>Squad Reconciled — Missing Order Created</b>\nRef: ${reference}\nAmount: ${(amountPaid / 100).toLocaleString("en-NG")} NGN\nChallenge: ${challenge.name}`,
    } as never).catch(() => {});

    await attemptDelivery(order.id, userId, challengeId);
    created.push({ reference, orderId: order.id });
  }

  return created;
}

async function reconcilePayments(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ---- Step 1: Poll Squad for payments that never created an order ----
  let reconciled = 0;
  const squadSecret = process.env.SQUAD_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;
  if (squadSecret) {
    try {
      const created = await pollSquadTransactions(squadSecret);
      reconciled = created.length;
    } catch (e) {
      console.error("[reconcile-payments] Squad poll failed:", e);
    }
  } else {
    console.warn("[reconcile-payments] No SQUAD_SECRET_KEY configured — skipping Squad poll");
  }

  // ---- Step 2: Find paid orders and check which ones are missing trader_accounts ----
  const { data: paidOrders, error: queryErr } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, challenge_id, created_at")
    .eq("status", "paid")
    .order("created_at", { ascending: true });

  if (queryErr) {
    console.error("[reconcile-payments] Query failed:", queryErr);
    return Response.json({ error: queryErr.message }, { status: 500 });
  }

  if (!paidOrders || paidOrders.length === 0) {
    return Response.json({ ok: true, reconciled, processed: 0 });
  }

  // Get all order_ids that already have an account delivered
  const orderIds = paidOrders.map((o) => o.id);
  const { data: deliveredAccounts } = await supabaseAdmin
    .from("trader_accounts")
    .select("order_id")
    .in("order_id", orderIds);

  const deliveredOrderIds = new Set(
    (deliveredAccounts ?? []).map((a) => a.order_id)
  );

  const undelivered = paidOrders.filter((o) => !deliveredOrderIds.has(o.id));

  if (undelivered.length === 0) {
    return Response.json({ ok: true, reconciled, total: paidOrders.length, undelivered: 0 });
  }

  let attempts = 0;
  let errors = 0;

  for (const order of undelivered) {
    try {
      await attemptDelivery(order.id, order.user_id, order.challenge_id);
      attempts++;
    } catch (e) {
      console.error("[reconcile-payments] Delivery failed for order", order.id, e);
      errors++;
    }
  }

  return Response.json({
    ok: true,
    reconciled,
    total: paidOrders.length,
    undelivered: undelivered.length,
    delivered: attempts,
    errors,
  });
}
