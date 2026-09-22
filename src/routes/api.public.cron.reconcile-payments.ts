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

const RECONCILE_ALERT_THROTTLE_MS = 60 * 60 * 1000; // at most one "manual delivery needed" alert per order per hour

/**
 * True if a reconcile alert was already sent for this order within the throttle
 * window. Uses mt5_worker_events as the dedup ledger so the job can keep
 * retrying delivery every run without spamming Telegram while the pool is empty.
 */
async function reconcileAlertThrottled(orderId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("mt5_worker_events")
    .select("payload")
    .eq("event_type", "reconcile_alert")
    .eq("worker_id", "reconcile")
    .gte("created_at", new Date(Date.now() - RECONCILE_ALERT_THROTTLE_MS).toISOString())
    .limit(200);
  return (data ?? []).some((e) => {
    const payload = (e as unknown as { payload?: { order_id?: string } } | null)?.payload;
    return payload?.order_id === orderId;
  });
}

async function attemptDelivery(orderId: string, userId: string, challengeId: string) {
  const { data: challenge } = await supabaseAdmin
    .from("challenges")
    .select("id, name, account_size, currency")
    .eq("id", challengeId)
    .maybeSingle();

  if (!challenge) return;

  const poolResult = await claimPoolAccount({
    orderId,
    accountSizeNgn: challenge.account_size,
    currency: challenge.currency ?? "NGN",
    challengeId: challenge.id,
    userId,
    phase: 1,
    notifyOnEmpty: false,
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

    await supabaseAdmin
      .rpc(
        "send_telegram" as never,
        {
          p_message: `✅ <b>Reconciliation Delivery</b>\nTrader: ${traderName}\nChallenge: ${challenge.name}\nLogin: ${poolResult.mt5Login}\nServer: ${poolResult.mt5Server}`,
        } as never,
      )
      .catch(() => {});
  } else if (!(await reconcileAlertThrottled(orderId))) {
    await supabaseAdmin
      .rpc(
        "send_telegram" as never,
        {
          p_message: `⏳ <b>Reconciliation — Manual Delivery Needed</b>\nTrader: ${traderName}\nChallenge: ${challenge.name}\nOrder: ${orderId}\nReason: ${poolResult?.error ?? "Pool unavailable"}`,
        } as never,
      )
      .catch(() => {});

    await supabaseAdmin
      .from("mt5_worker_events")
      .insert({
        event_type: "reconcile_alert",
        worker_id: "reconcile",
        payload: { order_id: orderId, reason: poolResult?.error ?? "Pool unavailable" },
      } as never)
      .then(({ error }) => {
        if (error) console.warn("[reconcile-payments] alert ledger insert failed:", error.message);
      });
  }
}

const SQUAD_LOOKBACK_MS = 24 * 60 * 60 * 1000; // re-scan the last 24h — safe because orders are deduped by paystack_reference
const SQUAD_PAGE_SIZE = 50;
const SQUAD_MAX_PAGES = 20;

interface SquadTransaction {
  transaction_ref?: string;
  transaction_status?: string;
  transaction_amount?: number;
  email?: string;
  meta?: Record<string, string>;
  metadata?: Record<string, string>;
}

async function pollSquadTransactions(squadSecret: string) {
  const now = new Date();
  const from = new Date(now.getTime() - SQUAD_LOOKBACK_MS);

  // Fetch every page in the window; stop when a page comes back short.
  const transactions: SquadTransaction[] = [];
  for (let page = 1; page <= SQUAD_MAX_PAGES; page++) {
    const queryUrl = new URL("https://api-d.squadco.com/transaction/query");
    queryUrl.searchParams.set("page", String(page));
    queryUrl.searchParams.set("perPage", String(SQUAD_PAGE_SIZE));
    queryUrl.searchParams.set("from", from.toISOString());
    queryUrl.searchParams.set("to", now.toISOString());

    const res = await fetch(queryUrl.toString(), {
      headers: { Authorization: `Bearer ${squadSecret}` },
    });

    if (!res.ok) {
      console.error("[reconcile-payments] Squad query failed:", res.status);
      break;
    }

    const json = await res.json().catch(() => ({}));
    const pageTransactions: SquadTransaction[] = Array.isArray(json?.data)
      ? (json.data as SquadTransaction[])
      : Array.isArray(json?.records)
        ? (json.records as SquadTransaction[])
        : [];
    transactions.push(...pageTransactions);
    if (pageTransactions.length < SQUAD_PAGE_SIZE) break;

    // Early exit: if every successful payment on this page already has an
    // order, there is nothing to reconcile further back. Squad returns pages
    // newest-first, so once the newest gap-free page is confirmed, all older
    // transactions are already accounted for too. This keeps the common
    // "nothing to reconcile" run at 1-2 page fetches regardless of the window.
    const successRefs = pageTransactions
      .filter((t) => (t.transaction_status ?? "").toLowerCase() === "success")
      .map((t) => t.transaction_ref)
      .filter((r): r is string => Boolean(r));
    if (successRefs.length > 0) {
      const { data: found } = await supabaseAdmin
        .from("orders")
        .select("paystack_reference")
        .in("paystack_reference", successRefs);
      const present = new Set((found ?? []).map((o) => String(o.paystack_reference)));
      if (successRefs.every((r) => present.has(r))) {
        console.log(
          `[reconcile-payments] Page ${page}: all ${successRefs.length} transactions already reconciled — stopping pagination`,
        );
        break;
      }
    }
  }

  if (transactions.length === 0) return [];

  // Dedupe by transaction_ref — a transaction can appear on more than one page.
  const seen = new Set<string>();
  const unique = transactions.filter((tx) => {
    const ref = tx?.transaction_ref;
    if (!ref || seen.has(ref)) return false;
    seen.add(ref);
    return true;
  });

  if (unique.length === 0) return [];

  // Process transactions in parallel batches (5 concurrent calls keeps Squad
  // rate limits happy while collapsing the verify + create latency).
  const BATCH_SIZE = 5;
  const created: Array<{ reference: string; orderId: string }> = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((tx) => processTransaction(tx, squadSecret)));
    for (const r of results) if (r) created.push(r);
  }

  return created;
}

type CreatedOrder = { reference: string; orderId: string };

/**
 * Handle one Squad transaction: skip non-success / already-known refs, resolve
 * user + challenge (verifying with Squad when metadata is missing), create the
 * missing order, notify, and attempt delivery. Returns the created order when
 * one was made, else null.
 */
async function processTransaction(
  tx: SquadTransaction,
  squadSecret: string,
): Promise<CreatedOrder | null> {
  const reference = tx.transaction_ref;
  const txStatus = (tx.transaction_status ?? "").toLowerCase();
  if (!reference || txStatus !== "success") return null;

  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (existing) return null;

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
    if (!challengeId)
      challengeId = vData?.meta?.challenge_id ?? tx.meta?.challenge_id ?? tx.metadata?.challenge_id;
  }

  if (!userId || !challengeId) {
    console.warn(
      `[reconcile-payments] Cannot resolve user/challenge for ${reference} — notifying admin`,
    );
    await supabaseAdmin
      .rpc(
        "send_telegram" as never,
        {
          p_message: `⚠️ <b>Unresolved Squad Payment</b>\nRef: ${reference}\nAmount: ${(tx.transaction_amount ?? 0) / 100} NGN\nEmail: ${tx.email ?? "N/A"}\nNo metadata — manual check needed.`,
        } as never,
      )
      .catch(() => {});
    return null;
  }

  const { data: challenge } = await supabaseAdmin
    .from("challenges")
    .select("id, name, account_size, price_naira")
    .eq("id", challengeId)
    .maybeSingle();

  if (!challenge) {
    console.warn(`[reconcile-payments] Challenge ${challengeId} not found for ${reference}`);
    return null;
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
    console.error(
      `[reconcile-payments] Order creation failed for ${reference}:`,
      orderErr?.message,
    );
    return null;
  }

  await supabaseAdmin
    .rpc(
      "send_telegram" as never,
      {
        p_message: `🔄 <b>Squad Reconciled — Missing Order Created</b>\nRef: ${reference}\nAmount: ${(amountPaid / 100).toLocaleString("en-NG")} NGN\nChallenge: ${challenge.name}`,
      } as never,
    )
    .catch(() => {});

  await attemptDelivery(order.id, userId, challengeId);
  return { reference, orderId: order.id };
}

async function reconcilePayments(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Track partial progress so a mid-run failure reports exactly what it had
  // done before dying, instead of a bare 500 with an empty Cloudflare log.
  const summary: {
    reconciled: number;
    total: number;
    undelivered: number;
    delivered: number;
    errors: number;
  } = {
    reconciled: 0,
    total: 0,
    undelivered: 0,
    delivered: 0,
    errors: 0,
  };

  try {
    // ---- Step 1: Poll Squad for payments that never created an order ----
    const squadSecret = process.env.SQUAD_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;
    if (squadSecret) {
      summary.reconciled = (await pollSquadTransactions(squadSecret)).length;
    } else {
      console.warn("[reconcile-payments] No SQUAD_SECRET_KEY configured — skipping Squad poll");
    }

    // ---- Step 2: Find paid orders and check which ones are missing trader_accounts ----
    const { data: paidOrders, error: queryErr } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, challenge_id, created_at")
      .eq("status", "paid")
      .order("created_at", { ascending: true });

    if (queryErr) throw new Error(queryErr.message);

    if (!paidOrders || paidOrders.length === 0) {
      return Response.json({ ok: true, ...summary });
    }
    summary.total = paidOrders.length;

    // Get all order_ids that already have an account delivered
    const orderIds = paidOrders.map((o) => o.id);
    const { data: deliveredAccounts } = await supabaseAdmin
      .from("trader_accounts")
      .select("order_id")
      .in("order_id", orderIds);

    const deliveredOrderIds = new Set((deliveredAccounts ?? []).map((a) => a.order_id));

    const undelivered = paidOrders.filter((o) => !deliveredOrderIds.has(o.id));
    summary.undelivered = undelivered.length;

    if (undelivered.length === 0) {
      return Response.json({ ok: true, ...summary });
    }

    for (const order of undelivered) {
      try {
        await attemptDelivery(order.id, order.user_id, order.challenge_id);
        summary.delivered++;
      } catch (e) {
        console.error("[reconcile-payments] Delivery failed for order", order.id, e);
        summary.errors++;
      }
    }

    return Response.json({ ok: true, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconcile-payments] fatal", e);
    return Response.json(
      {
        ok: false,
        error: msg,
        fatalAt: msg,
        ...summary,
      },
      { status: 500 },
    );
  }
}
