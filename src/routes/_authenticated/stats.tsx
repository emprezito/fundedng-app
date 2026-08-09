import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatUSD, formatNaira } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, CalendarDays, BarChart3, DollarSign, Target, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/stats")({ component: StatsPage });

interface Account {
  id: string; mt5_login: string; starting_balance: number; current_phase: number;
  status: string; currency?: string; trading_days?: number; created_at: string; phase1_passed_at: string | null;
  phase2_passed_at: string | null; funded_at: string | null;
  challenges?: { name: string; min_trading_days?: number; profit_target_percent: number; phase2_profit_target_percent?: number | null; max_drawdown_percent: number; phases: number; drawdown_type?: string };
}

interface ClosedTrade {
  ticket: number; symbol: string; profit: number; close_time: string;
  duration_seconds: number; volume: number;
}

function StatsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Account | null>(null);
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<"phase1" | "phase2" | "funded">("phase1");

  const todayLocal = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const localDateKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  useEffect(() => {
    if (!user) return;
    supabase
      .from("trader_accounts")
      .select("*, challenges(name,min_trading_days,profit_target_percent,phase2_profit_target_percent,max_drawdown_percent,phases,drawdown_type)")
      .eq("user_id", user.id)
      .in("status", ["active", "funded", "passed"])
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as Account[]) ?? [];
        setAccounts(list);
        if (list.length > 0) setSelected(list[0]);
      });
  }, [user]);

  const phaseInfo = useMemo(() => {
    if (!selected) return [];
    const info: { key: "phase1" | "phase2" | "funded"; label: string; start: string; end: string | null }[] = [];
    info.push({ key: "phase1", label: "Phase 1", start: selected.created_at, end: selected.phase1_passed_at ?? null });
    if (selected.phase1_passed_at) {
      info.push({ key: "phase2", label: "Phase 2", start: selected.phase1_passed_at, end: selected.phase2_passed_at ?? selected.funded_at ?? null });
    }
    if (selected.phase2_passed_at || selected.funded_at) {
      info.push({ key: "funded", label: "Funded", start: selected.phase2_passed_at ?? selected.funded_at, end: null });
    }
    return info;
  }, [selected]);

  const filteredTrades = useMemo(() => {
    const active = phaseInfo.find(p => p.key === selectedPhase);
    if (!active || !trades.length) return trades;
    return trades.filter(t => {
      const ct = t.close_time;
      return ct >= active.start && (!active.end || ct < active.end);
    });
  }, [trades, phaseInfo, selectedPhase]);

  const activePhase = phaseInfo.find(p => p.key === selectedPhase);

  useEffect(() => {
    if (!selected) return;
    supabase
      .from("closed_trades")
      .select("ticket, symbol, profit, close_time, duration_seconds, volume")
      .eq("account_id", selected.id)
      .order("close_time", { ascending: true })
      .then(({ data }) => setTrades((data as ClosedTrade[]) ?? []));
    const last = phaseInfo[phaseInfo.length - 1];
    if (last) setSelectedPhase(last.key);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;

    // Fast path: append new closed_trades individually
    const tradesChannel = supabase
      .channel(`stats-closed-trades-${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "closed_trades",
          filter: `account_id=eq.${selected.id}`,
        },
        (payload) => {
          setTrades((prev) => [...prev, payload.new as ClosedTrade]);
        },
      )
      .subscribe();

    // Reliable fallback: sync-equity-v2 inserts an account_snapshot on every
    // sync.  When one arrives, refetch all trades for the current phase.
    const snapChannel = supabase
      .channel(`stats-snapshots-${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "account_snapshots",
          filter: `trader_account_id=eq.${selected.id}`,
        },
        () => {
          supabase
            .from("closed_trades")
            .select("ticket, symbol, profit, close_time, duration_seconds, volume")
            .eq("account_id", selected.id)
            .order("close_time", { ascending: true })
            .then(({ data }) => setTrades((data as ClosedTrade[]) ?? []));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(snapChannel);
    };
  }, [selected?.id]);

  const tradesByDay = useMemo(() => {
    const map = new Map<string, ClosedTrade[]>();
    for (const t of filteredTrades) {
      const day = t.close_time.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(t);
    }
    return map;
  }, [filteredTrades]);

  const dailyPnL = useMemo(() => {
    const map = new Map<string, number>();
    for (const [day, dayTrades] of tradesByDay) {
      map.set(day, dayTrades.reduce((sum, t) => sum + t.profit, 0));
    }
    return map;
  }, [tradesByDay]);

  const profitableTradingDays = useMemo(() => {
    if (!selected) return 0;
    const isUSD = selected.currency === "USD";
    if (!isUSD) return tradesByDay.size;
    const threshold = Number(selected.starting_balance) * 0.005;
    let count = 0;
    for (const [, dayPnL] of dailyPnL.entries()) {
      if (dayPnL >= threshold) count++;
    }
    return count;
  }, [dailyPnL, tradesByDay, selected]);

  const calendarDays = useMemo(() => {
    if (!activePhase) return [];
    const days: { date: Date; key: string; pnl: number | null; trades: ClosedTrade[] }[] = [];

    const year = currentYear;
    const month = currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startPad = firstDay.getDay();

    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, -startPad + i + 1);
      days.push({ date: d, key: "", pnl: null, trades: [] });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const key = localDateKey(year, month, d);
      const pnl = dailyPnL.get(key) ?? null;
      const dayTrades = tradesByDay.get(key) ?? [];
      days.push({ date, key, pnl, trades: dayTrades });
    }

    return days;
  }, [currentYear, currentMonth, activePhase, dailyPnL, tradesByDay]);

  const phaseTrades = filteredTrades;
  const shortHeldTrades = phaseTrades.filter(t => t.duration_seconds < 180);
  const shortHeldCount = shortHeldTrades.length;
  const totalPnL = phaseTrades.reduce((sum, t) => sum + t.profit, 0);
  const bestDay = [...dailyPnL.entries()].sort((a, b) => b[1] - a[1])[0];
  const worstDay = [...dailyPnL.entries()].sort((a, b) => a[1] - b[1])[0];

  const fmt = selected?.currency === "USD" ? formatUSD : formatNaira;

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Trading Stats</h1>
          <p className="text-sm text-muted-foreground">Your closed trades, calendar &amp; phase progress</p>
        </div>
      </div>

      {accounts.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {accounts.map((a) => (
            <button key={a.id} onClick={() => setSelected(a)}
              className={`font-display rounded-md border px-3 py-1.5 text-xs ${selected?.id === a.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
              {a.mt5_login} · {a.challenges?.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          {/* Phase selector */}
          {phaseInfo.length > 1 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {phaseInfo.map((p) => (
                <button key={p.key} onClick={() => setSelectedPhase(p.key)}
                  className={`font-display rounded-md border px-3 py-1.5 text-xs ${selectedPhase === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Trading Calendar */}
          <div className="mt-6 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display flex items-center gap-2 text-base font-semibold">
                <CalendarDays className="h-4 w-4 text-primary" />
                Trading Calendar — {selected.challenges?.name ?? "Account"}
              </h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="font-display text-sm font-semibold min-w-[140px] text-center">{monthNames[currentMonth]} {currentYear}</span>
                <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {dayNames.map((name) => (
                <div key={name} className="bg-muted/50 px-2 py-1.5 text-center text-[11px] font-semibold text-muted-foreground">{name}</div>
              ))}
              {calendarDays.map((day, i) => {
                if (!day.key) return <div key={`pad-${i}`} className="bg-card p-2" />;
                const isToday = day.key === todayLocal;
                const pnl = day.pnl;
                const color = pnl === null ? "bg-card"
                  : pnl > 0 ? "bg-green-500/10"
                  : pnl < 0 ? "bg-red-500/10"
                  : "bg-muted/30";
                const textColor = pnl === null ? ""
                  : pnl > 0 ? "text-green-600 dark:text-green-400"
                  : pnl < 0 ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground";
                return (
                  <button
                    onClick={() => setSelectedDay(day.trades.length > 0 ? day.key : null)}
                    className={`w-full ${color} p-2 pb-3 pt-2.5 text-center transition-colors hover:brightness-95 cursor-pointer border-0 ${isToday ? "ring-1 ring-primary" : ""}`}
                  >
                    <div className="font-display text-xs font-semibold">{day.date.getDate()}</div>
                    {pnl !== null && (
                      <div className={`text-[10px] font-medium leading-tight ${textColor}`}>
                        {pnl > 0 ? "+" : ""}{fmt(pnl)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <Dialog open={selectedDay !== null} onOpenChange={(open) => { if (!open) setSelectedDay(null); }}>
              <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="font-display">
                    Trades — {selectedDay ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}
                  </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto -mx-6 px-6">
                  {selectedDay && (tradesByDay.get(selectedDay) ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No trades this day</p>
                  ) : (
                    <div className="space-y-1 pb-2">
                      {(tradesByDay.get(selectedDay ?? "") ?? []).map((t) => {
                        const isShort = t.duration_seconds < 180;
                        return (
                          <div key={t.ticket} className={`flex items-center justify-between gap-4 rounded-md px-3 py-2 border-l-2 ${isShort ? "border-red-400 bg-red-500/5" : "border-transparent hover:bg-muted/30"}`}>
                            <span className="font-mono text-xs text-muted-foreground w-16">#{t.ticket}</span>
                            <span className="font-display text-sm flex-1">{t.symbol}</span>
                            <span className={`text-xs w-16 text-right ${isShort ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>{t.duration_seconds}s</span>
                            <span className={`text-xs w-24 text-right font-medium ${t.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {t.profit >= 0 ? "+" : ""}{fmt(t.profit)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-500/20" /> Green = profitable day</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-500/20" /> Red = losing day</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-muted/30" /> Grey = breakeven</span>
              <span>Click a day to see individual trades</span>
            </div>
          </div>

          {/* Phase Summary Stats */}
          <div className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="font-display flex items-center gap-2 text-base font-semibold mb-5">
              <BarChart3 className="h-4 w-4 text-primary" />
              {activePhase?.label ?? "Phase"} Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {selected?.currency === "USD" ? "Profitable Days" : "Trading Days"}</div>
                <div className="font-display mt-1 text-lg font-bold">{profitableTradingDays}</div>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" /> Min Required</div>
                <div className="font-display mt-1 text-lg font-bold">{selected.currency === "USD" ? "5" : (selected.challenges?.min_trading_days ?? 3)}</div>
                {selected?.currency === "USD" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">≥0.5% profit each</div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Closed Trades</div>
                <div className="font-display mt-1 text-lg font-bold">{phaseTrades.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Net P&amp;L</div>
                <div className={`font-display mt-1 text-lg font-bold ${totalPnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {totalPnL >= 0 ? "+" : ""}{fmt(totalPnL)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Trophy className="h-3 w-3 text-green-500" /> Best Day</div>
                <div className="font-display mt-1 text-lg font-bold text-green-600 dark:text-green-400">
                  {bestDay ? fmt(bestDay[1]) : "—"}
                </div>
                {bestDay && <div className="text-[10px] text-muted-foreground">{new Date(bestDay[0]).toLocaleDateString()}</div>}
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3 text-red-500" /> Worst Day</div>
                <div className="font-display mt-1 text-lg font-bold text-red-600 dark:text-red-400">
                  {worstDay ? fmt(worstDay[1]) : "—"}
                </div>
                {worstDay && <div className="text-[10px] text-muted-foreground">{new Date(worstDay[0]).toLocaleDateString()}</div>}
              </div>
            </div>
          </div>

          {/* Scalping Tracker */}
          <div className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="font-display flex items-center gap-2 text-base font-semibold mb-5">
              <TrendingUp className="h-4 w-4 text-primary" />
              Scalping Tracker
            </h2>

            {shortHeldCount === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <span className="text-lg">✓</span> No scalping violations in {activePhase?.label ?? "this phase"}
              </div>
            ) : (
              <>
                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold">{shortHeldCount} / 4 short-held trades</span>
                    <span className="text-xs text-muted-foreground">4th short-held trade triggers automatic breach</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        shortHeldCount >= 4 ? "bg-red-500" : shortHeldCount >= 3 ? "bg-orange-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.min((shortHeldCount / 4) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Short-held trades table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left py-2 pr-3 font-semibold">Ticket</th>
                        <th className="text-left py-2 pr-3 font-semibold">Symbol</th>
                        <th className="text-left py-2 pr-3 font-semibold">Duration</th>
                        <th className="text-right py-2 font-semibold">P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shortHeldTrades.map((t) => (
                        <tr key={t.ticket} className="border-b border-border/50">
                          <td className="py-1.5 pr-3 font-mono text-muted-foreground">#{t.ticket}</td>
                          <td className="py-1.5 pr-3 font-display">{t.symbol}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{t.duration_seconds}s</td>
                          <td className={`py-1.5 text-right ${t.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {t.profit >= 0 ? "+" : ""}{fmt(t.profit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {!selected && (
        <div className="mt-10 rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="font-display mt-3 text-base font-semibold">No active accounts</p>
          <p className="mt-1 text-sm text-muted-foreground">Purchase a challenge to start tracking your stats.</p>
          <Link to="/buy"><Button className="mt-4 font-display">Buy a challenge</Button></Link>
        </div>
      )}
    </div>
  );
}
