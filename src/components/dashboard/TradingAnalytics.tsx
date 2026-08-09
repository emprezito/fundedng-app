import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Activity, Calendar, BarChart2, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertCircle, Zap } from "lucide-react";
import { formatNaira, formatUSD, formatPercent } from "@/lib/utils";

interface Snapshot {
  snapshot_time: string;
  equity: number;
  balance: number;
  drawdown_percent?: number;
  profit?: number;
}

interface TradingAnalyticsProps {
  snapshots: Snapshot[];
  startingBalance: number;
  currentEquity: number;
  maxDrawdownPercent: number;
  profitTargetPercent: number;
  minTradingDays: number;
  currentPhase: number;
  status: "active" | "breached" | "passed" | "funded";
  tradingDays: number;
  currency?: string;
  maxDailyDrawdownPercent?: number;
  dailyDrawdownPercent?: number;
  drawdownType?: string;
  currentDrawdownPercent?: number;
}

function getDailyPL(snapshots: Snapshot[]) {
  const byDay: Record<string, { open: number; close: number; date: string }> = {};
  for (const s of snapshots) {
    const day = s.snapshot_time.slice(0, 10);
    if (!byDay[day]) byDay[day] = { open: s.equity, close: s.equity, date: day };
    byDay[day].close = s.equity;
  }
  return Object.values(byDay).map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-NG", { month: "short", day: "numeric" }),
    pnl: d.close - d.open,
    positive: d.close >= d.open,
  }));
}

function getPeakDrawdown(snapshots: Snapshot[], startingBalance: number, drawdownType?: string) {
  if (drawdownType === "static_balance") {
    let maxDD = 0;
    for (const s of snapshots) {
      const dd = startingBalance > 0 ? ((startingBalance - s.balance) / startingBalance) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }
  let peak = startingBalance;
  let maxDD = 0;
  for (const s of snapshots) {
    if (s.equity > peak) peak = s.equity;
    const dd = peak > 0 ? ((peak - s.equity) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function getEquityChartData(snapshots: Snapshot[], startingBalance: number) {
  if (snapshots.length === 0) return [];
  const step = Math.max(1, Math.floor(snapshots.length / 60));
  const sampled = snapshots.filter((_, i) => i % step === 0);
  return sampled.map((s) => ({
    time: new Date(s.snapshot_time).toLocaleDateString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    equity: s.equity,
    balance: s.balance,
    pnl: s.equity - startingBalance,
  }));
}

function DrawdownMeter({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, (current / max) * 100);
  const r = 44;
  const cx = 56;
  const cy = 56;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - pct / 100);
  const color = pct > 75 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";

  return (
    <div className="flex flex-col items-center">
      <svg width="112" height="64" viewBox="0 0 112 64">
        <path
          d={`M 12 56 A ${r} ${r} 0 0 1 100 56`}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d={`M 12 56 A ${r} ${r} 0 0 1 100 56`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s ease, stroke 0.5s ease" }}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill={color} fontFamily="var(--font-display, monospace)">
          {current.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="currentColor" opacity={0.5} fontFamily="inherit">
          of {max}% limit
        </text>
      </svg>
    </div>
  );
}

function RuleChecklist({ status, profitPct, target, ddPct, maxDD, daysTraded, minDays, dailyDDPct, maxDailyDD }:
  { status: string; profitPct: number; target: number; ddPct: number; maxDD: number; daysTraded: number; minDays: number; dailyDDPct?: number; maxDailyDD?: number }) {
  const rules = [
    {
      label: "Max drawdown ≤ " + maxDD + "%",
      description: `Current: ${ddPct.toFixed(2)}% drawdown`,
      passed: ddPct < maxDD,
      warn: ddPct / maxDD > 0.75,
    },
    ...(maxDailyDD != null ? [{
      label: `Max daily drawdown ≤ ${maxDailyDD}%`,
      description: `Today: ${(dailyDDPct ?? 0).toFixed(2)}% drawdown from daily peak`,
      passed: (dailyDDPct ?? 0) < maxDailyDD,
      warn: (dailyDDPct ?? 0) / maxDailyDD > 0.75,
    }] : []),
    {
      label: `All profits in ${minDays}+ min trading days`,
      description: `${daysTraded} of ${minDays} days traded (profits must be spread across ${minDays} days)`,
      passed: daysTraded >= minDays,
      warn: daysTraded > 0 && daysTraded < minDays,
    },
    {
      label: `Profit target: ${target}%`,
      description: `${profitPct.toFixed(2)}% / ${target}% reached`,
      passed: profitPct >= target,
      warn: profitPct > 0 && profitPct < target,
    },
  ];

  return (
    <div className="space-y-2">
      {rules.map((r, i) => {
        const Icon = r.passed ? CheckCircle2 : r.warn ? AlertCircle : XCircle;
        const color = r.passed ? "text-green-500" : r.warn ? "text-amber-500" : "text-muted-foreground";
        const bg = r.passed ? "bg-green-500/5 border-green-500/20" : r.warn ? "bg-amber-500/5 border-amber-500/20" : "bg-border/30 border-border";
        return (
          <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 ${bg}`}>
            <Icon className={`h-4 w-4 shrink-0 ${color}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-semibold font-display ${color}`}>{r.label}</div>
              <div className="text-[11px] text-muted-foreground">{r.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TradingAnalytics({
  snapshots,
  startingBalance,
  currentEquity,
  maxDrawdownPercent,
  profitTargetPercent,
  minTradingDays = 3,
  currentPhase,
  status,
  tradingDays,
  currency,
  maxDailyDrawdownPercent,
  dailyDrawdownPercent,
  drawdownType,
  currentDrawdownPercent,
}: TradingAnalyticsProps) {
  const isStaticBalance = drawdownType === "static_balance";
  const chartData = getEquityChartData(snapshots, startingBalance);
  const dailyPL = getDailyPL(snapshots);
  const daysTraded = tradingDays;
  const peakDD = getPeakDrawdown(snapshots, startingBalance, drawdownType);
  const currentDD = currentDrawdownPercent != null
    ? Math.max(0, currentDrawdownPercent)
    : peakDD;
  const profitPct = startingBalance > 0 ? ((currentEquity - startingBalance) / startingBalance) * 100 : 0;
  const totalPL = currentEquity - startingBalance;
  const isProfit = totalPL >= 0;

  const fmt = currency === "USD" ? formatUSD : formatNaira;

  const drawdownLimit = isStaticBalance
    ? startingBalance * (1 - maxDrawdownPercent / 100)
    : Math.max(startingBalance, currentEquity) * (1 - maxDrawdownPercent / 100);
  const profitTargetEquity = startingBalance * (1 + profitTargetPercent / 100);

  const tradeCount = snapshots.length;

  if (snapshots.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Activity className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="font-display mt-3 text-sm font-semibold text-muted-foreground">No trading data yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Analytics will appear once your account starts syncing equity data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-bold">Trading Analytics</h3>
        <span className="ml-auto rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-primary">
          Phase {currentPhase}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Total P/L",
            value: fmt(totalPL),
            sub: `${isProfit ? "+" : ""}${profitPct.toFixed(2)}%`,
            icon: isProfit ? TrendingUp : TrendingDown,
            color: isProfit ? "text-green-500" : "text-red-500",
            bg: isProfit ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5",
          },
          {
            label: isStaticBalance ? "Static Drawdown" : "Current Drawdown",
            value: `${currentDD.toFixed(2)}%`,
            sub: `Limit: ${maxDrawdownPercent}%`,
            icon: BarChart2,
            color: currentDD / maxDrawdownPercent > 0.75 ? "text-red-500" : currentDD / maxDrawdownPercent > 0.5 ? "text-amber-500" : "text-green-500",
            bg: currentDD / maxDrawdownPercent > 0.75 ? "border-red-500/20 bg-red-500/5" : "border-border bg-card",
          },
          ...(maxDailyDrawdownPercent != null ? [{
            label: "Daily Drawdown",
            value: `${(dailyDrawdownPercent ?? 0).toFixed(2)}%`,
            sub: `Limit: ${maxDailyDrawdownPercent}%`,
            icon: ShieldAlert,
            color: (dailyDrawdownPercent ?? 0) / maxDailyDrawdownPercent > 0.75 ? "text-red-500" : (dailyDrawdownPercent ?? 0) / maxDailyDrawdownPercent > 0.5 ? "text-amber-500" : "text-green-500",
            bg: (dailyDrawdownPercent ?? 0) / maxDailyDrawdownPercent > 0.75 ? "border-red-500/20 bg-red-500/5" : "border-border bg-card",
          }] : []),
          {
            label: "Sync Points",
            value: tradeCount.toLocaleString(),
            sub: "Updated live",
            icon: Activity,
            color: "text-primary",
            bg: "border-border bg-card",
          },
          {
            label: "Days Traded",
            value: `${daysTraded}`,
            sub: `Min ${minTradingDays} required`,
            icon: Calendar,
            color: daysTraded >= minTradingDays ? "text-green-500" : "text-amber-500",
            bg: daysTraded >= minTradingDays ? "border-green-500/20 bg-green-500/5" : "border-amber-500/20 bg-amber-500/5",
          },
        ].map((stat, i) => (
          <div key={i} className={`rounded-xl border p-4 ${stat.bg}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-display uppercase tracking-wide text-muted-foreground">{stat.label}</span>
              <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
            </div>
            <div className={`font-display mt-2 text-lg font-bold leading-tight ${stat.color}`}>{stat.value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            Equity Curve
          </h4>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-4 bg-primary rounded" />Equity</span>
            <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-4 bg-amber-400 rounded opacity-60" style={{backgroundImage: "repeating-linear-gradient(90deg, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px)"}} />Balance</span>
            <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-4 bg-red-500 rounded opacity-60" />DD Limit</span>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="time" hide tick={{ fontSize: 10 }} />
              <YAxis
                tick={{ fontSize: 10, fill: "currentColor" }}
                stroke="transparent"
                className="text-muted-foreground"
                tickFormatter={(v) => fmt(v)}
                width={80}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [
                  fmt(v),
                  name === "equity" ? "Equity" : name === "balance" ? "Balance" : name,
                ]}
                labelStyle={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 4 }}
              />
              <Area type="monotone" dataKey="balance" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 5" fill="url(#balanceGrad)" dot={false} />
              <Area type="monotone" dataKey="equity" stroke="var(--primary)" strokeWidth={2} fill="url(#equityGrad)" dot={false} />
              <ReferenceLine
                y={drawdownLimit}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{ value: "DD Limit", position: "insideTopLeft", fill: "#ef4444", fontSize: 9 }}
              />
              <ReferenceLine
                y={profitTargetEquity}
                stroke="#22c55e"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{ value: `Target ${profitTargetPercent}%`, position: "insideTopRight", fill: "#22c55e", fontSize: 9 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="font-display text-sm font-semibold flex items-center gap-1.5 mb-4">
            <BarChart2 className="h-3.5 w-3.5 text-primary" />
            Daily P/L Breakdown
          </h4>
          {dailyPL.length > 0 ? (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyPL} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "currentColor" }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 9, fill: "currentColor" }} className="text-muted-foreground" tickFormatter={(v) => fmt(v)} width={72} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [fmt(v), "Daily P/L"]}
                  />
                  <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {dailyPL.map((entry, index) => (
                      <Cell key={index} fill={entry.positive ? "#22c55e" : "#ef4444"} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-36 flex items-center justify-center text-xs text-muted-foreground">No daily data yet</div>
          )}
        </div>

        <div className="flex flex-col gap-4 min-w-[180px]">
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center">
            <div className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Drawdown Meter</div>
            <DrawdownMeter current={currentDD} max={maxDrawdownPercent} />
            <div className={`mt-2 font-display text-[11px] font-bold ${currentDD / maxDrawdownPercent > 0.75 ? "text-red-500" : currentDD / maxDrawdownPercent > 0.5 ? "text-amber-500" : "text-green-500"}`}>
              {currentDD / maxDrawdownPercent > 0.75 ? "⚠ HIGH RISK" : currentDD / maxDrawdownPercent > 0.5 ? "CAUTION" : "HEALTHY"}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Days Traded
            </div>
            <div className="flex items-end gap-1 mb-2">
              {Array.from({ length: Math.max(minTradingDays, daysTraded) }).map((_, i) => {
                const done = i < daysTraded;
                const required = i < minTradingDays;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm transition-all ${done ? "bg-primary" : required ? "bg-border" : "bg-border/40"}`}
                    style={{ height: done ? "28px" : "20px" }}
                    title={done ? `Day ${i + 1} traded` : required ? `Day ${i + 1} required` : `Day ${i + 1}`}
                  />
                );
              })}
            </div>
            <div className="font-display text-[11px]">
              <span className={daysTraded >= minTradingDays ? "text-green-500 font-bold" : "text-amber-500 font-semibold"}>
                {daysTraded}
              </span>
              <span className="text-muted-foreground"> / {minTradingDays} min days</span>
            </div>
            {daysTraded >= minTradingDays && (
              <div className="mt-1 text-[10px] text-green-500 font-display">✓ Requirement met</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h4 className="font-display text-sm font-semibold flex items-center gap-1.5 mb-4">
          {status === "breached" ? (
            <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          )}
          Rule Compliance Checklist
        </h4>
        <RuleChecklist
          status={status}
          profitPct={profitPct}
          target={profitTargetPercent}
          ddPct={currentDD}
          maxDD={maxDrawdownPercent}
          daysTraded={daysTraded}
          minDays={minTradingDays}
          dailyDDPct={dailyDrawdownPercent}
          maxDailyDD={maxDailyDrawdownPercent}
        />
      </div>
    </div>
  );
}
