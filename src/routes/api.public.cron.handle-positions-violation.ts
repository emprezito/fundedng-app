import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";

interface PositionViolation {
  type: "max_positions" | "averaging_down" | "lot_splitting";
  symbol: string;
  tickets: string[];
  position_count: number;
  direction?: string;
}

export const Route = createFileRoute("/api/public/cron/handle-positions-violation")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handlePositionsViolation(request),
    },
  },
});

async function handlePositionsViolation(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    account_id?: string;
    mt5_login?: string;
    violations?: PositionViolation[];
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

  const allTickets = violations.flatMap(v => v.tickets).map(Number);

  // Dedup: filter out tickets already recorded in processed_violations
  const { data: existing } = await supabaseAdmin
    .from("processed_violations")
    .select("ticket")
    .eq("account_id", account_id)
    .eq("violation_type", "positions")
    .in("ticket", allTickets);

  const existingTickets = new Set((existing ?? []).map(r => String(r.ticket)));
  const newViolations = violations.filter(v =>
    v.tickets.some(t => !existingTickets.has(t)),
  );

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

  // Record processed tickets early to prevent double-counting on concurrent calls
  const insertRows = [...new Set(newViolations.flatMap(v => v.tickets).map(Number))].map(
    ticket => ({
      account_id,
      ticket,
      violation_type: "positions" as const,
    }),
  );

  const { error: insertErr } = await supabaseAdmin
    .from("processed_violations")
    .insert(insertRows)
    .select();

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  const v = newViolations[0];
  let breachReason: string;
  if (v.type === "averaging_down") {
    breachReason = `Averaging down violation: a position was added to ${v.symbol} at a worse price than an existing ${v.direction || ""} position (tickets #${v.tickets.join(", #")}). Adding to a losing position is prohibited — instant breach.`;
  } else if (v.type === "lot_splitting") {
    breachReason = `Lot-splitting violation: ${v.position_count} ${v.direction || ""} positions were opened on ${v.symbol} within 60 seconds (tickets #${v.tickets.join(", #")}). Splitting an order into multiple entries is prohibited — instant breach.`;
  } else {
    breachReason = `Position stacking violation: ${v.position_count} ${v.direction || ""} positions were open on ${v.symbol} at the same time (maximum 2 per symbol per direction; tickets #${v.tickets.join(", #")}). Position count is not reset by the 60-second window — instant breach.`;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("trader_accounts")
    .update({
      status: "breached",
      breach_reason: breachReason,
    })
    .eq("id", account_id);

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  // Insert trader notification
  let notificationMessage: string;
  if (v.type === "averaging_down") {
    notificationMessage = `You added to a ${v.symbol} position at a worse price than your existing position. Averaging down is prohibited — the account has been breached.`;
  } else if (v.type === "lot_splitting") {
    notificationMessage = `You opened ${v.position_count} ${v.symbol} positions in quick succession (within 60 seconds). Order splitting is prohibited — the account has been breached.`;
  } else {
    notificationMessage = `You had ${v.position_count} ${v.direction || ""} positions open on ${v.symbol} at the same time (max 2 per symbol per direction). The account has been breached.`;
  }
  await supabaseAdmin.from("notifications").insert({
    user_id: account.user_id,
    title: "⚠️ Account Breached — Position Violation",
    message: notificationMessage,
    type: "breach",
  });

  // Send breach email
  try {
    await sendEventEmail({
      type: "breached",
      accountId: account_id,
      reason: breachReason,
    });
  } catch (emailErr) {
    console.error("[handle-positions-violation] Breach email failed:", emailErr);
  }

  // Telegram alert
  try {
    await supabaseAdmin.rpc("send_telegram" as never, {
      p_message: `🚫 <b>Position Violation Breach</b>\nAccount: ${mt5_login ?? account_id}\nReason: ${breachReason}\n👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>`,
    } as never);
  } catch (e) {
    console.error("[handle-positions-violation] Telegram send failed:", e);
  }

  return Response.json({
    ok: true,
    action: "breached",
    violation_type: v.type,
    violations_count: newViolations.length,
  });
}
