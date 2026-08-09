import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";

interface ScalpingViolation {
  symbol: string;
  open_time: number;
  close_time: number;
  duration_seconds: number;
  profit: number;
  volume: number;
  ticket: number;
}

export const Route = createFileRoute("/api/public/cron/handle-scalping")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleScalping(request),
    },
  },
});

function hasOverlappingTrades(violations: ScalpingViolation[]): boolean {
  for (let i = 0; i < violations.length; i++) {
    for (let j = i + 1; j < violations.length; j++) {
      const a = violations[i];
      const b = violations[j];
      if (a.open_time < b.close_time && b.open_time < a.close_time) {
        return true;
      }
    }
  }
  return false;
}

async function handleScalping(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    account_id?: string;
    mt5_login?: string;
    violations?: ScalpingViolation[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { account_id, mt5_login, violations } = body;

  if (!account_id || !violations || violations.length === 0) {
    return Response.json({ ok: true, action: "none" });
  }

  // Dedup: filter out tickets already recorded in processed_violations
  const { data: existing } = await supabaseAdmin
    .from("processed_violations")
    .select("ticket")
    .eq("account_id", account_id)
    .eq("violation_type", "scalping")
    .in("ticket", violations.map(v => v.ticket));

  const existingTickets = new Set((existing ?? []).map(r => r.ticket));
  const newViolations = violations.filter(v => !existingTickets.has(v.ticket));

  if (newViolations.length === 0) {
    return Response.json({ ok: true, action: "none" });
  }

  const { data: account } = await supabaseAdmin
    .from("trader_accounts")
    .select("id, user_id, status, breach_reason")
    .eq("id", account_id)
    .single();

  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  if (account.status === "breached") {
    return Response.json({ ok: true, action: "already_breached" });
  }

  // Record processed tickets to prevent double-counting on concurrent calls
  const insertRows = newViolations.map(v => ({
    account_id,
    ticket: v.ticket,
    violation_type: "scalping" as const,
  }));

  const { error: insertErr } = await supabaseAdmin
    .from("processed_violations")
    .insert(insertRows)
    .select();

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  // Log every new violation to short_held_trades for trader-facing history
  const shortHeldRows = newViolations.map(v => ({
    account_id,
    ticket: v.ticket,
    symbol: v.symbol,
    opened_at: new Date(v.open_time * 1000).toISOString(),
    closed_at: new Date(v.close_time * 1000).toISOString(),
    duration_seconds: v.duration_seconds,
  }));

  const { error: shortErr } = await supabaseAdmin
    .from("short_held_trades")
    .insert(shortHeldRows);

  if (shortErr) {
    console.error("[handle-scalping] short_held_trades insert failed:", shortErr);
  }

  // Two short-held trades open at the same time → instant breach (bypasses counter)
  if (hasOverlappingTrades(newViolations)) {
    const v = newViolations[0];
    const breachReason = `Scalping violation: two short-held trades overlapped in time (e.g., ${v.symbol} ticket #${v.ticket}). All trades must be held a minimum of 3 minutes (180s) regardless of close type.`;

    await supabaseAdmin
      .from("trader_accounts")
      .update({
        status: "breached",
        breach_reason: breachReason,
        scalping_warnings: 0,
      })
      .eq("id", account_id);

    await supabaseAdmin.from("notifications").insert({
      user_id: account.user_id,
      title: "⚠️ Account Breached — Scalping Violation",
      message: `Two trades were held for less than 3 minutes at the same time. All trades must be held a minimum of 3 minutes.`,
      type: "breach",
    });

    try {
      await sendEventEmail({
        type: "breached",
        accountId: account_id,
        reason: breachReason,
      });
    } catch (emailErr) {
      console.error("[handle-scalping] Breach email failed:", emailErr);
    }

    try {
      await supabaseAdmin.rpc("send_telegram" as never, {
        p_message: `🚫 <b>Scalping Breach — Overlapping Trades</b>\nAccount: ${mt5_login ?? account_id}\nReason: Two short-held trades overlapped\n👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>`,
      } as never);
    } catch (e) {
      console.error("[handle-scalping] Telegram send failed:", e);
    }

    return Response.json({ ok: true, action: "breached", reason: "overlapping_short_trades" });
  }

  // Atomically increment the scalping counter.  The RPC locks the row so
  // concurrent requests cannot overwrite each other's increments.
  const { data: newTotal, error: rpcErr } = await supabaseAdmin.rpc(
    "increment_scalping_warnings",
    {
      p_account_id: account_id,
      p_increment: newViolations.length,
    },
  );

  if (rpcErr) {
    return Response.json({ error: rpcErr.message }, { status: 500 });
  }

  if (newTotal === -1) {
    // Account was marked as breached between our read and the RPC
    return Response.json({ ok: true, action: "already_breached" });
  }

  // 4th+ short-held trade → breach
  if (newTotal >= 4) {
    const v = newViolations[0];
    const breachReason = `Scalping violation: ${v.symbol} trade closed in ${v.duration_seconds}s. All trades must be held a minimum of 3 minutes (180s) regardless of close type. Trade #${v.ticket}. Account breached on the 4th short-held trade.`;

    await supabaseAdmin
      .from("trader_accounts")
      .update({
        status: "breached",
        breach_reason: breachReason,
        scalping_warnings: 0,
      })
      .eq("id", account_id);

    await supabaseAdmin.from("notifications").insert({
      user_id: account.user_id,
      title: "⚠️ Account Breached — Scalping Violation",
      message: `A trade on ${v.symbol} was closed in ${v.duration_seconds} seconds. This was the 4th short-held trade — the account has been breached.`,
      type: "breach",
    });

    try {
      const { data: allShortHeld } = await supabaseAdmin
        .from("closed_trades")
        .select("ticket, symbol, duration_seconds, close_time, profit")
        .eq("account_id", account_id)
        .lt("duration_seconds", 180)
        .order("close_time", { ascending: true });

      await sendEventEmail({
        type: "breached",
        accountId: account_id,
        reason: breachReason,
        shortHeldTrades: allShortHeld ?? [],
      });
    } catch (emailErr) {
      console.error("[handle-scalping] Breach email failed:", emailErr);
    }

    try {
      await supabaseAdmin.rpc("send_telegram" as never, {
        p_message: `🚫 <b>Scalping Breach — 4th Short Trade</b>\nAccount: ${mt5_login ?? account_id}\nTrades: ${newViolations.length} new violation(s), ${newTotal} total\n👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>`,
      } as never);
    } catch (e) {
      console.error("[handle-scalping] Telegram send failed:", e);
    }

    return Response.json({
      ok: true,
      action: "breached",
      violations_count: newViolations.length,
      total_warnings: newTotal,
    });
  }

  // 1st through 3rd short-held trade → warning (counter already updated by RPC)
  const v = newViolations[0];
  const warningNum = newTotal;
  await supabaseAdmin.from("notifications").insert({
    user_id: account.user_id,
    title: `⚠️ Scalping Warning ${warningNum}/3`,
    message: `A trade on ${v.symbol} was closed in ${v.duration_seconds} seconds. Warning ${warningNum} of 3 — ${3 - warningNum} more short-held trades and the account will be breached. All trades must be held a minimum of 3 minutes.`,
    type: "warning",
  });

  return Response.json({
    ok: true,
    action: "warning",
    warnings_count: newTotal,
    violations_count: newViolations.length,
  });
}
