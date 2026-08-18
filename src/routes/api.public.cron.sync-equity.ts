import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { botEquity } from "@/lib/bot.server";

/**
 * Public cron endpoint — called by pg_cron every 5 minutes.
 * Pulls live equity/balance from MetaApi for every active/funded account
 * with a metaapi_account_id, writes a new account_snapshots row.
 * The enforce_trading_rules trigger handles phase-progression and breach detection.
 *
 * No body or signature required: this endpoint is read-then-write only,
 * and the writes are scoped to MetaApi's own returned data (no user input).
 * Worst case if abused: extra MetaApi reads — rate-limited by MetaApi itself.
 */
export const Route = createFileRoute("/api/public/cron/sync-equity")({
  server: {
    handlers: {
      POST: async () => syncEquity(),
      GET: async () => syncEquity(),
    },
  },
});

async function syncEquity() {
  const startedAt = Date.now();
  const { data: accounts, error } = await supabaseAdmin
    .from("trader_accounts")
    .select("id, mt5_login, provider, starting_balance, peak_equity, status, last_synced_at, trading_days, challenges(drawdown_type)")
    .in("status", ["active", "funded"])
    .eq("provider", "exness-bot")
    .eq("monitor_paused", false);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const list = accounts ?? [];
  let synced = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  // Process sequentially to be gentle on the bot + Exness portal.
  for (const acct of list) {
    if (!acct.mt5_login) continue;
    try {
      const info = await botEquity(acct.mt5_login);
      if (!info) {
        failed++;
        continue;
      }
      const profit = info.equity - acct.starting_balance;
      const drawdownType = (acct as any).challenges?.drawdown_type ?? "trailing_equity";
      const isTrailingBalance = drawdownType === "trailing_balance";
      const metric = isTrailingBalance ? Number(info.balance) : Number(info.equity);

      const prevPeak = Number(acct.peak_equity ?? acct.starting_balance);
      const justReset = Math.abs(prevPeak - acct.starting_balance) < 1;
      const balanceIsReset = Math.abs(info.balance - acct.starting_balance) < acct.starting_balance * 0.02;

      let peak: number;
      if (justReset && !balanceIsReset) {
        peak = acct.starting_balance;
      } else {
        peak = Math.max(acct.starting_balance, prevPeak, metric);
      }

      const drawdown =
        metric < peak
          ? ((peak - metric) / peak) * 100
          : 0;

      const { error: snapErr } = await supabaseAdmin.from("account_snapshots").insert({
        trader_account_id: acct.id,
        equity: info.equity,
        balance: info.balance,
        profit,
        drawdown_percent: Number(drawdown.toFixed(2)),
      });
      if (snapErr) {
        failed++;
        errors.push({ id: acct.id, error: snapErr.message });
        continue;
      }

      const today = new Date().toISOString().slice(0, 10);
      const lastSyncDay = acct.last_synced_at
        ? acct.last_synced_at.slice(0, 10)
        : null;
      const isNewDay = lastSyncDay !== today;

      await supabaseAdmin
        .from("trader_accounts")
        .update({
          last_synced_at: new Date().toISOString(),
          current_equity: info.equity,
          peak_equity: peak,
          trading_days: isNewDay
            ? (acct.trading_days ?? 0) + 1
            : acct.trading_days ?? 0,
        })
        .eq("id", acct.id);
      synced++;
    } catch (e) {
      failed++;
      errors.push({ id: acct.id, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  await supabaseAdmin.from("mt5_worker_events").insert({
    event_type: "equity_sync_run",
    worker_id: "cron",
    payload: { synced, failed, total: list.length, ms: Date.now() - startedAt, errors: errors.slice(0, 5) },
  });

  return Response.json({ ok: true, synced, failed, total: list.length });
}