import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";

interface NewsViolation {
  symbol: string;
  open_time: number;
  event_title: string;
  event_time: number;
  volume: number;
  ticket: number;
}

export const Route = createFileRoute("/api/public/cron/handle-news-violation")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleNewsViolation(request),
    },
  },
});

async function handleNewsViolation(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    account_id?: string;
    mt5_login?: string;
    violations?: NewsViolation[];
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
    .eq("violation_type", "news")
    .in("ticket", violations.map(v => v.ticket));

  const existingTickets = new Set((existing ?? []).map(r => r.ticket));
  const newViolations = violations.filter(v => !existingTickets.has(v.ticket));

  if (newViolations.length === 0) {
    return Response.json({ ok: true, action: "none" });
  }

  // Check if already breached
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
  const insertRows = newViolations.map(v => ({
    account_id,
    ticket: v.ticket,
    violation_type: "news" as const,
  }));

  const { error: insertErr } = await supabaseAdmin
    .from("processed_violations")
    .insert(insertRows)
    .select();

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  // Build breach reason from the first violation
  const v = newViolations[0];
  const breachReason = `News trading violation: trade opened on ${v.symbol} near high-impact news event "${v.event_title}". No trades may be opened 5 minutes before or 5 minutes after a high-impact news event. Trade #${v.ticket}`;

  // Update account status to breached
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
  await supabaseAdmin.from("notifications").insert({
    user_id: account.user_id,
    title: "⚠️ Account Breached — News Trading Violation",
    message: `A trade on ${v.symbol} was opened near a high-impact news event (${v.event_title}). No new trades may be opened 5 minutes before or 5 minutes after a high-impact news event.`,
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
    console.error("[handle-news-violation] Breach email failed:", emailErr);
  }

  return Response.json({
    ok: true,
    action: "breached",
    violations_count: newViolations.length,
  });
}
