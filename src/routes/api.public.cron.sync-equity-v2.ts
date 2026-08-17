import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";

export const Route = createFileRoute("/api/public/cron/sync-equity-v2")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => syncEquityV2(request),
      GET: async ({ request }: { request: Request }) => syncEquityV2(request),
    },
  },
});

async function refreshTradingDays(accountId: string) {
  try {
    const { data: acct } = await supabaseAdmin
      .from("trader_accounts")
      .select("current_phase, phase1_passed_at, created_at, starting_balance, currency")
      .eq("id", accountId)
      .single();

    if (!acct) return;

    const phaseStart = acct.current_phase >= 2 && acct.phase1_passed_at
      ? acct.phase1_passed_at
      : acct.created_at;

    const isUSD = acct.currency === "USD";
    const startingBalance = Number(acct.starting_balance ?? 0);
    const threshold = startingBalance * 0.005; // 0.5% of starting balance — fixed target

    const { data: closeData } = await supabaseAdmin
      .from("closed_trades")
      .select("close_time, profit, symbol, open_time, ticket")
      .eq("account_id", accountId)
      .gte("close_time", phaseStart)
      .order("close_time", { ascending: true });

    if (!closeData || closeData.length === 0) {
      const { error: updateErr } = await supabaseAdmin
        .from("trader_accounts")
        .update({ trading_days: 0 })
        .eq("id", accountId);
      if (updateErr) console.error(`[sync-equity-v2] refreshTradingDays update failed:`, updateErr);
      return;
    }

    // Group trades by UTC date, sum profit per day
    const dayMap = new Map<string, number>();
    for (const t of closeData) {
      const date = t.close_time.slice(0, 10);
      dayMap.set(date, (dayMap.get(date) ?? 0) + Number(t.profit));
    }

    let profitableDays = 0;
    if (isUSD) {
      // Count days where net profit met or exceeded the 0.5% threshold
      for (const dayProfit of dayMap.values()) {
        if (dayProfit >= threshold) profitableDays++;
      }
    } else {
      profitableDays = dayMap.size;
    }

    // Server-side concurrent position check — only check trades reported in the last 24 hours
    // to prevent retroactive breaches for historical violations the EA didn't catch
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentTrades } = await supabaseAdmin
      .from("closed_trades")
      .select("symbol, open_time, close_time, ticket")
      .eq("account_id", accountId)
      .gte("created_at", oneDayAgo);

    if (recentTrades && recentTrades.length >= 3) {
      const bySymbol = new Map<string, Array<{ open_time: string; close_time: string; ticket: number }>>();
      for (const t of recentTrades) {
        if (!t.symbol || !t.open_time || !t.close_time) continue;
        if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
        bySymbol.get(t.symbol)!.push({ open_time: t.open_time, close_time: t.close_time, ticket: t.ticket });
      }
      for (const [symbol, trades] of bySymbol) {
        if (trades.length < 3) continue;
        trades.sort((a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime());
        for (let i = 0; i < trades.length; i++) {
          const current = trades[i];
          const currentOpen = new Date(current.open_time).getTime();
          const currentClose = new Date(current.close_time).getTime();
          const concurrent: number[] = [current.ticket];
          for (let j = i + 1; j < trades.length; j++) {
            const other = trades[j];
            const otherOpen = new Date(other.open_time).getTime();
            if (otherOpen < currentClose) {
              concurrent.push(other.ticket);
            }
          }
          if (concurrent.length >= 3) {
            const breachReason = `Position stacking violation (server-side): ${concurrent.length} simultaneous positions detected on ${symbol} (tickets #${concurrent.join(", #")}). Maximum 2 open positions per symbol per account — instant breach.`;
            await supabaseAdmin.from("trader_accounts").update({ status: "breached", breach_reason: breachReason }).eq("id", accountId);
            const { data: acctInfo } = await supabaseAdmin.from("trader_accounts").select("user_id, mt5_login").eq("id", accountId).single();
            if (acctInfo) {
              await supabaseAdmin.from("notifications").insert({ user_id: acctInfo.user_id, title: "⚠️ Account Breached — Position Violation", message: `You had ${concurrent.length} positions open on ${symbol} at the same time (max 2 per symbol). The account has been breached.`, type: "breach" });
              try { await sendEventEmail({ type: "breached", accountId, reason: breachReason }); } catch {}
              try { await supabaseAdmin.rpc("send_telegram" as never, { p_message: `🚫 <b>Position Violation Breach (Server-Side)</b>\nAccount: ${acctInfo.mt5_login ?? accountId}\nReason: ${breachReason}\n👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>` } as never); } catch {}
            }
            return;
          }
        }
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("trader_accounts")
      .update({ trading_days: profitableDays })
      .eq("id", accountId);

    if (updateErr) {
      console.error(`[sync-equity-v2] refreshTradingDays update failed:`, updateErr);
    }
  } catch (e) {
    console.error(`[sync-equity-v2] refreshTradingDays error:`, e);
  }
}

async function syncEquityV2(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    account_id?: string;
    mt5_login?: string;
    equity?: number;
    balance?: number;
    profit?: number;
    scalping_violations?: Array<{
      symbol: string;
      open_time: number;
      close_time: number;
      duration_seconds: number;
      profit: number;
      volume: number;
      ticket: number;
    }>;
    news_violations?: Array<{
      symbol: string;
      open_time: number;
      event_title: string;
      event_time: number;
      volume: number;
      ticket: number;
    }>;
    weekend_violations?: Array<{
      symbol: string;
      ticket: number;
      open_time: number;
      volume: number;
    }>;
    fetcher_only?: boolean;
    open_positions?: Array<{
      ticket: number;
      symbol: string;
      open_time: number;
      volume: number;
      profit: number;
      price_open: number;
      type: string;
    }>;
    closed_deals?: Array<{
      ticket: number;
      symbol: string;
      open_time: number;
      close_time: number;
      duration_seconds: number;
      profit: number;
      volume: number;
      close_price?: number;
      type?: string;
    }>;
    position_violations?: Array<{
      type: string;
      symbol: string;
      tickets: string[];
      position_count: number;
      direction?: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { account_id, mt5_login, equity, balance, profit, scalping_violations, news_violations, weekend_violations, closed_deals, fetcher_only, open_positions, position_violations } = body;

  // Trades fetcher path — skip equity/drawdown/peak, only sync trade data
  if (fetcher_only === true) {
    if (closed_deals?.length) {
      const { error: upsertErr } = await supabaseAdmin
        .from("closed_trades")
        .upsert(
          closed_deals.map((d: any) => ({
            account_id:       account_id,
            ticket:           d.ticket,
            symbol:           d.symbol,
            open_time:        new Date(d.open_time * 1000).toISOString(),
            close_time:       new Date(d.close_time * 1000).toISOString(),
            duration_seconds: d.duration_seconds,
            profit:           d.profit,
            volume:           d.volume,
            trade_type:       d.type ?? null,
          })),
          { onConflict: "account_id,ticket", ignoreDuplicates: true }
        );
      if (upsertErr) {
        console.error(`[sync-equity-v2] closed_trades upsert failed for ${account_id}:`, upsertErr);
      }
    }

    if (open_positions !== undefined) {
      await supabaseAdmin
        .from("open_positions")
        .delete()
        .eq("account_id", account_id);

      if (open_positions.length > 0) {
        await supabaseAdmin
          .from("open_positions")
          .insert(
            open_positions.map((p: any) => ({
              account_id:  account_id,
              ticket:      p.ticket,
              symbol:      p.symbol,
              open_time:   new Date(p.open_time * 1000).toISOString(),
              volume:      p.volume,
              profit:      p.profit,
              price_open:  p.price_open,
              type:        p.type,
            }))
          );
      }
    }

    await refreshTradingDays(account_id);

    if (scalping_violations?.length > 0) {
      const scalingUrl = new URL(request.url);
      scalingUrl.pathname = "/api/public/cron/handle-scalping";
      await fetch(scalingUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "x-cron-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({
          account_id,
          mt5_login,
          violations: scalping_violations,
        }),
      });
    }

    // Forward position violations to the handler endpoint
    if (position_violations?.length > 0) {
      const positionsUrl = new URL(request.url);
      positionsUrl.pathname = "/api/public/cron/handle-positions-violation";
      await fetch(positionsUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "x-cron-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({
          account_id,
          mt5_login,
          violations: position_violations,
        }),
      });
    }

    // Safety net: if closed_trades has 4+ short-held trades, breach regardless
    // of whether scalping_violations were reported or the counter triggered.
    const { count: shortCount } = await supabaseAdmin
      .from("closed_trades")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account_id)
      .lt("duration_seconds", 180);

    if (shortCount !== null && shortCount >= 4) {
      const { data: acct } = await supabaseAdmin
        .from("trader_accounts")
        .select("id, user_id, status")
        .eq("id", account_id)
        .single();

      if (acct && acct.status !== "breached") {
        const breachReason = `Scalping violation: account breached after ${shortCount} short-held trades (held under 180s). All trades must be held a minimum of 3 minutes regardless of close type.`;

        await supabaseAdmin
          .from("trader_accounts")
          .update({
            status: "breached",
            breach_reason: breachReason,
            scalping_warnings: 0,
          })
          .eq("id", account_id);

        await supabaseAdmin.from("notifications").insert({
          user_id: acct.user_id,
          title: "⚠️ Account Breached — Scalping Violation",
          message: `Your account was breached after ${shortCount} trades were held for less than 3 minutes. All trades must be held a minimum of 3 minutes.`,
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
          console.error("[sync-equity-v2] Breach email failed:", emailErr);
        }

        try {
          await supabaseAdmin.rpc("send_telegram" as never, {
            p_message: `🚫 <b>Scalping Breach — Safety Net</b>\nAccount: ${mt5_login ?? account_id}\nShort-held trades: ${shortCount}\n👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>`,
          } as never);
        } catch (e) {
          console.error("[sync-equity-v2] Telegram send failed:", e);
        }
      }
    }

    return Response.json({ ok: true, fetcher_only: true });
  }

  if (
    !account_id ||
    !mt5_login ||
    equity === undefined ||
    balance === undefined ||
    profit === undefined
  ) {
    return Response.json(
      { error: "Missing required fields: account_id, mt5_login, equity, balance, profit" },
      { status: 400 }
    );
  }

  const { data: account, error: acctErr } = await supabaseAdmin
    .from("trader_accounts")
    .select("id, status, starting_balance, peak_equity, last_synced_at, trading_days, challenges(drawdown_type)")
    .eq("id", account_id)
    .in("status", ["active", "funded"])
    .eq("monitor_paused", false)
    .single();

  if (acctErr || !account) {
    return Response.json(
      { error: "Account not found or status not active/funded" },
      { status: 404 }
    );
  }

  const startingBalance = Number(account.starting_balance);
  const prevPeak = Number(account.peak_equity ?? startingBalance);

  // Drawdown is measured against balance (realized) for trailing_balance
  // accounts and against equity (floating) for everything else.
  const drawdownType = (account as any).challenges?.drawdown_type ?? "trailing_equity";
  const isTrailingBalance = drawdownType === "trailing_balance";
  const metric = isTrailingBalance ? Number(balance) : Number(equity);

  // If peak_equity in DB equals starting_balance exactly, this account was just
  // phase-reset. Don't let incoming equity (which may still reflect old phase
  // profits) inflate the peak. Only allow equity to raise peak once balance
  // also confirms the reset (i.e. balance close to starting_balance).
  const justReset = Math.abs(prevPeak - startingBalance) < 1;
  const balanceIsReset = Math.abs(balance - startingBalance) < startingBalance * 0.02;

  let newPeak: number;
  if (justReset && !balanceIsReset) {
    newPeak = startingBalance;
  } else {
    newPeak = Math.max(startingBalance, prevPeak, metric);
  }

  const drawdownPercent =
    metric < newPeak
      ? Number((((newPeak - metric) / newPeak) * 100).toFixed(2))
      : 0;

  const { error: snapErr } = await supabaseAdmin
    .from("account_snapshots")
    .insert({
      trader_account_id: account_id,
      equity,
      balance,
      profit,
      drawdown_percent: drawdownPercent,
    });

  if (snapErr) {
    return Response.json({ error: snapErr.message }, { status: 500 });
  }

  const { data: updatedAccount, error: updateErr } = await supabaseAdmin
    .from("trader_accounts")
    .update({
      last_synced_at: new Date().toISOString(),
      current_equity: equity,
      peak_equity: newPeak,
    })
    .eq("id", account_id)
    .select("status, breach_reason")
    .single();

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  if (updatedAccount.status === "breached") {
    try {
      await sendEventEmail({
        type: "breached",
        accountId: account_id,
        reason: updatedAccount.breach_reason ?? "Maximum drawdown exceeded",
      });
    } catch (emailErr) {
      console.error("[sync-equity-v2] Breach email failed:", emailErr);
    }

    try {
      await supabaseAdmin.rpc("send_telegram" as never, {
        p_message: `🚫 <b>Drawdown Breach</b>\nAccount: ${mt5_login ?? account_id}\nReason: ${updatedAccount.breach_reason ?? "Maximum drawdown exceeded"}\n👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>`,
      } as never);
    } catch (e) {
      console.error("[sync-equity-v2] Telegram send failed:", e);
    }
  }

  // Forward news violations to the handler endpoint
  if (news_violations?.length > 0) {
    const newsUrl = new URL(request.url);
    newsUrl.pathname = "/api/public/cron/handle-news-violation";
    try {
      const resp = await fetch(newsUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({
          account_id,
          mt5_login,
          violations: news_violations,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(`[sync-equity-v2] news handler returned ${resp.status}: ${body}`);
      }
    } catch (e) {
      console.error("[sync-equity-v2] news forward failed:", e);
    }
  }

  // Recalculate trading days from closed_trades
  await refreshTradingDays(account_id);

  // Forward weekend violations to the handler endpoint
  if (weekend_violations?.length > 0) {
    const weekendUrl = new URL(request.url);
    weekendUrl.pathname = "/api/public/cron/handle-weekend-violation";
    try {
      const resp = await fetch(weekendUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({
          account_id,
          mt5_login,
          violations: weekend_violations,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(`[sync-equity-v2] weekend handler returned ${resp.status}: ${body}`);
      }
    } catch (e) {
      console.error("[sync-equity-v2] weekend forward failed:", e);
    }
  }

  // Upsert closed deals into closed_trades for stats & scalping detection
  if (closed_deals?.length) {
    const { error: upsertErr } = await supabaseAdmin
      .from("closed_trades")
      .upsert(
        closed_deals.map((d: any) => ({
          account_id:       account_id,
          ticket:           d.ticket,
          symbol:           d.symbol,
          open_time:        new Date(d.open_time * 1000).toISOString(),
          close_time:       new Date(d.close_time * 1000).toISOString(),
          duration_seconds: d.duration_seconds,
          profit:           d.profit,
          volume:           d.volume,
          trade_type:       d.type ?? null,
        })),
        { onConflict: "account_id,ticket", ignoreDuplicates: true }
      );
    if (upsertErr) {
      console.error(`[sync-equity-v2] closed_trades upsert failed for ${account_id}:`, upsertErr);
    }
  }

  // Forward scalping violations to the handler endpoint
  if (scalping_violations?.length > 0) {
    const scalingUrl = new URL(request.url);
    scalingUrl.pathname = "/api/public/cron/handle-scalping";
    try {
      const resp = await fetch(scalingUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "x-cron-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({
          account_id,
          mt5_login,
          violations: scalping_violations,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(`[sync-equity-v2] scalping handler returned ${resp.status}: ${body}`);
      }
    } catch (e) {
      console.error("[sync-equity-v2] scalping forward failed:", e);
    }
  }

  // Forward position violations to the handler endpoint
  if (position_violations?.length > 0) {
    const positionsUrl = new URL(request.url);
    positionsUrl.pathname = "/api/public/cron/handle-positions-violation";
    try {
      const resp = await fetch(positionsUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "x-cron-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({
          account_id,
          mt5_login,
          violations: position_violations,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(`[sync-equity-v2] positions handler returned ${resp.status}: ${body}`);
      }
    } catch (e) {
      console.error("[sync-equity-v2] positions forward failed:", e);
    }
  }

  // Safety net: if closed_trades has 4+ short-held trades, breach regardless
  // of whether scalping_violations were reported or the counter triggered.
  const { count: shortCount } = await supabaseAdmin
    .from("closed_trades")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account_id)
    .lt("duration_seconds", 180);

  if (shortCount !== null && shortCount >= 4) {
    const { data: acct } = await supabaseAdmin
      .from("trader_accounts")
      .select("id, user_id, status")
      .eq("id", account_id)
      .single();

    if (acct && acct.status !== "breached") {
      const breachReason = `Scalping violation: account breached after ${shortCount} short-held trades (held under 180s). All trades must be held a minimum of 3 minutes regardless of close type.`;

      await supabaseAdmin
        .from("trader_accounts")
        .update({
          status: "breached",
          breach_reason: breachReason,
          scalping_warnings: 0,
        })
        .eq("id", account_id);

      await supabaseAdmin.from("notifications").insert({
        user_id: acct.user_id,
        title: "⚠️ Account Breached — Scalping Violation",
        message: `Your account was breached after ${shortCount} trades were held for less than 3 minutes. All trades must be held a minimum of 3 minutes.`,
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
        console.error("[sync-equity-v2] Breach email failed:", emailErr);
      }

      try {
        await supabaseAdmin.rpc("send_telegram" as never, {
          p_message: `🚫 <b>Scalping Breach — Safety Net</b>\nAccount: ${mt5_login ?? account_id}\nShort-held trades: ${shortCount}\n👉 <a href="https://app.fundedng.com/admin">Open Admin Panel</a>`,
        } as never);
      } catch (e) {
        console.error("[sync-equity-v2] Telegram send failed:", e);
      }
    }
  }

  return Response.json({
    ok: true,
    account_id,
    drawdown_percent: drawdownPercent,
    status: updatedAccount.status,
  });
}
