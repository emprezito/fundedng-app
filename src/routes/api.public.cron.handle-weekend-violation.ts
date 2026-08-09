import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";

interface WeekendViolation {
  symbol: string;
  ticket: number;
  open_time: number;
  volume: number;
}

export const Route = createFileRoute("/api/public/cron/handle-weekend-violation")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleWeekendViolation(request),
    },
  },
});

async function handleWeekendViolation(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    account_id?: string;
    mt5_login?: string;
    violations?: WeekendViolation[];
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

  // Dedup: filter out already-processed tickets
  const { data: existing } = await supabaseAdmin
    .from("processed_violations")
    .select("ticket")
    .eq("account_id", account_id)
    .eq("violation_type", "weekend")
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

  // Weekend holding is an instant breach
  const v = newViolations[0];
  const breachReason = `Weekend holding violation: position on ${v.symbol} (ticket #${v.ticket}) was held open into the weekend market close. Positions must be closed before weekend close to avoid gap risk. Crypto pairs are exempt from this rule.`;

  // Record processed tickets BEFORE the update so a concurrent call
  // that also passes dedup will see them
  const insertRows = newViolations.map(nv => ({
    account_id,
    ticket: nv.ticket,
    violation_type: "weekend" as const,
  }));

  const { error: insertErr } = await supabaseAdmin
    .from("processed_violations")
    .insert(insertRows)
    .select();

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
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
  await supabaseAdmin.from("notifications").insert({
    user_id: account.user_id,
    title: "⚠️ Account Breached — Weekend Holding Violation",
    message: `Position ${v.symbol} (ticket #${v.ticket}) was held open into the weekend market close. Positions must be closed before weekend close to avoid gap risk. Crypto pairs are exempt from this rule.`,
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
    console.error("[handle-weekend-violation] Breach email failed:", emailErr);
  }

  return Response.json({
    ok: true,
    action: "breached",
    violations_count: newViolations.length,
  });
}
