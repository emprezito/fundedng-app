import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PublicHeader } from "@/components/site/PublicHeader";
import { Brand } from "@/components/site/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/utils";
import { ShieldCheck, Zap, ArrowRight, AlertTriangle, Clock, TrendingUp, Wallet, Ban, CheckCircle2, Users, Layers } from "lucide-react";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { title: "Trading Rules — FundedNG" },
      { name: "description", content: "Full breakdown of FundedNG's prop trading rules: 20% max drawdown (balance-based) with a 10% daily loss limit, 3-minute minimum hold time with 4-warning grace, weekly activity requirement, profit targets, payouts, and what's allowed." },
      { property: "og:title", content: "Trading Rules — FundedNG" },
      { property: "og:description", content: "Just 3 main rules — 20% max drawdown (balance-based) with a 10% daily loss limit, 3-minute minimum hold time with 4 warnings, and 3 days minimum trading. See the full rulebook here." },
    ],
  }),
  component: RulesPage,
});

function RulesPage() {
  const [rulesTab, setRulesTab] = useState<"NGN" | "USD">("NGN");
  return (
    <div className="min-h-screen">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-surface">
        <div className="absolute inset-0 gradient-radial-primary opacity-30" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center md:px-6">
          <Badge variant="outline" className="font-display border-primary/40 text-primary">RULEBOOK</Badge>
          <h1 className="font-display mt-4 text-5xl font-bold leading-tight md:text-6xl">
            Simple, transparent <span className="text-primary text-glow">trading rules</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Just 3 main rules to keep your account alive. Everything else is here for full clarity — no hidden gotchas.
          </p>
          <div className="mt-6 inline-flex items-center rounded-full border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setRulesTab("NGN")}
              className={`font-display rounded-full px-6 py-2 text-xs tracking-wider transition-all ${rulesTab === "NGN" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              NGN ACCOUNTS
            </button>
            <button
              type="button"
              onClick={() => setRulesTab("USD")}
              className={`font-display rounded-full px-6 py-2 text-xs tracking-wider transition-all ${rulesTab === "USD" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              USD ACCOUNTS
            </button>
          </div>
        </div>
      </section>

      {rulesTab === "NGN" && (<>
      {/* The 3 main NGN rules */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge variant="outline" className="font-display border-primary/40 text-primary">THE 3 MAIN RULES</Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">Break any one and your account closes.</h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <div className="rounded-xl border-2 border-primary/40 bg-card p-8 glow-primary">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-primary/30">01</div>
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">Max 20% Drawdown (Balance-based)</h3>
              <p className="mt-3 text-muted-foreground">
                Your account balance must never drop more than 20% from the highest balance reached (trailing).
                For example, if your account peaks at ₦220,000, balance must stay above ₦176,000.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Measured on closed balance, trailing from the highest balance reached — floating losses never count.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Plus a 10% max daily loss, trailing from the day's highest balance (resets midnight UTC).</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Hit it once and the account is closed permanently.</li>
              </ul>
            </div>

            <div className="rounded-xl border-2 border-primary/40 bg-card p-8 glow-primary">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-primary/30">02</div>
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">No Tick Scalping</h3>
              <p className="mt-3 text-muted-foreground">
                Each trade must remain open for at least 3 minutes before closing. Breached on the 4th short-held detection:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> 1st through 3rd short-held trade → warning (visible on your dashboard)</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> 4th short-held trade → instant breach, account closes</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Two short-held trades open at the same time → instant breach</li>
              </ul>
            </div>

            <div className="rounded-xl border-2 border-primary/40 bg-card p-8 glow-primary">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-primary/30">03</div>
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">Weekly Activity Requirement</h3>
              <p className="mt-3 text-muted-foreground">
                You must execute at least 1 trade every calendar week to keep your account active, with a minimum of 3 trading days completed in each evaluation phase.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> A trading day = at least one executed position opened and closed on that calendar day.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Profits must be spread across at least 3 different trading days per phase.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> At least 1 trade per calendar week to remain active.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Reason: our liquidity provider removes inactive accounts after extended inactivity — this keeps yours from being dropped.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Instant Challenge Rules */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge variant="outline" className="font-display border-chart-2/40 text-chart-2">INSTANT CHALLENGE RULES</Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">Different rules for Instant Challenges</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Instant Challenges are a 1-step evaluation with a few key differences from the standard 2-step program.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <div className="rounded-xl border-2 border-chart-2/40 bg-card p-8">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-chart-2/30">01</div>
                <TrendingUp className="h-8 w-8 text-chart-2" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">15% Profit Target</h3>
              <p className="mt-3 text-muted-foreground">
                Instant Challenges require a 15% profit target — a single phase to funded. No phase 2. Reach 15% while staying within all drawdown limits and the account is funded.
              </p>
            </div>

            <div className="rounded-xl border-2 border-chart-2/40 bg-card p-8">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-chart-2/30">02</div>
                <ShieldCheck className="h-8 w-8 text-chart-2" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">10% Daily Drawdown</h3>
              <p className="mt-3 text-muted-foreground">
                Your account balance must not drop more than 10% in a single trading day, measured from the day's highest balance. In addition to the 20% total balance-based drawdown, this daily limit applies to all NGN challenges.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" /> Resets each trading day at midnight UTC, based on closed balance.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" /> Combined with the 20% balance-based max drawdown.</li>
              </ul>
            </div>

            <div className="rounded-xl border-2 border-chart-2/40 bg-card p-8">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-chart-2/30">03</div>
                <Clock className="h-8 w-8 text-chart-2" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">5–45 Day Trading Window</h3>
              <p className="mt-3 text-muted-foreground">
                You have a window of 5 to 45 calendar days to complete the Instant Challenge. You need a minimum of 5 trading days, and the entire challenge must be completed within 45 days.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" /> Min 5 trading days (instead of 3 for standard) with profits spread across them.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" /> Max 45 calendar days to complete the challenge.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" /> Same 80% profit split and weekly payouts apply.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Discounted Challenge Rules */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge variant="outline" className="font-display border-amber-400/40 text-amber-500">DISCOUNTED CHALLENGES</Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">Limited payouts for discounted challenges</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Challenges purchased at a discounted price are subject to a maximum of 2 payouts. Once two payouts have been
              made, the account will be considered fully settled and no further payouts will be processed.
            </p>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              This restriction applies to any challenge where a discount was applied at the point of purchase, including
              promotional codes, partner discounts, seasonal sales, or any other reduced-price offer. Standard-priced
              challenges are not affected by this limit.
            </p>
          </div>
        </div>
      </section>

      {/* Detailed rules */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge variant="outline" className="font-display border-primary/40 text-primary">FULL DETAILS</Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">Everything else, in plain English</h2>
          </div>

          <div className="mt-12 space-y-5">
            {[
              {
                icon: TrendingUp,
                title: "Profit Targets",
                body: "Each evaluation phase requires a 10% profit on your starting balance. Phase 1 → Phase 2 → Funded. There is no time limit to reach the target — take as many days as you need, as long as you meet the minimum trading day requirement.",
              },
              {
                icon: Clock,
                title: "Minimum Trading Days",
                body: "All profits in each phase must be made in at least 3 min trading days. A trading day = at least one executed position on that calendar day (Africa/Lagos). The system counts calendar days where at least one trade was opened and closed.",
              },
              {
                icon: Zap,
                title: "Weekly Activity Requirement",
                body: "You must execute at least 1 trade every calendar week to keep the account active. Missing a full week without any trade will result in the account being closed for inactivity. This applies during evaluation and after funding. Our liquidity provider removes inactive accounts after extended inactivity — this rule keeps your account from being dropped.",
              },
              {
                icon: Ban,
                title: "No Weekend Holding",
                body: "Positions must be closed before the weekend market close. Holding trades over the weekend is not permitted. Markets can gap significantly over the weekend — particularly on Gold, Indices, and certain FX pairs. A gap that opens beyond your Stop Loss can breach your account before you have any chance to react. This rule protects your account from weekend gap risk that is outside your control.",
              },
              {
                icon: Wallet,
                title: "Profit Split & Payouts",
                  body: "Funded traders keep 80% of profits. Payouts are processed within 24 hours of admin approval to your verified Nigerian bank account or USDT wallet. NGN challenges can request a payout once every 7 calendar days. USD challenges can request a payout once every 10 business days. USD payout caps: first 2 withdrawals capped at 6% of account size, subsequent withdrawals at 10%.",
              },
              {
                icon: AlertTriangle,
                title: "What Counts As A Breach",
                body: "A balance drop to 20% drawdown (balance-based from the highest balance reached) is a breach — as is losing 10% in a single day from the day's highest balance. So is a 4th short-held trade, two short-held trades open at the same time, opening 3+ positions on a single symbol, averaging into a losing position, or any attempt to manipulate price, abuse evaluation-server latency, or coordinate trades across accounts.",
              },
              {
                icon: Ban,
                title: "Prohibited Strategies",
                body: "No HFT, no tick scalping (closing trades in less than 3 minutes — 3 warnings then breach on 4th), no grid or martingale trading, no position stacking, no averaging into losing positions, no arbitrage between accounts, no copy-trading from another funded account, no use of EAs that aren't disclosed. Hedging within a single account is allowed.",
              },
              {
                icon: Layers,
                title: "Position Limits",
                body: "Maximum 2 open positions per symbol per account. Positions opened on the same symbol within 60 seconds of the first entry of a batch are treated as a single position. Adding to, or averaging into, a losing position (entering again at a worse price) is prohibited. Any of these is an instant breach. Hedging within a single account is allowed.",
              },
              {
                icon: Users,
                title: "No Gaming The System",
                body: "Creating or using multiple accounts to participate in free giveaway challenges, promotions, or any evaluation multiple times is strictly prohibited. All associated accounts will be permanently terminated and any pending payouts forfeited.",
              },
              {
                icon: ShieldCheck,
                title: "News Trading Restriction",
                body: "No new trades may be opened 5 minutes before or 5 minutes after any high-impact news event. Trades already open before the restricted window are not affected — they can remain open and close normally including via SL/TP. High-impact events are sourced from the ForexFactory economic calendar (red folder events). The wider 5-minute buffer gives more protection against post-release volatility spikes that can trigger Stop Losses unfairly.",
              },
              {
                icon: CheckCircle2,
                title: "Allowed Instruments",
                body: "All FX pairs, Gold, Silver, Indices, and Crypto CFDs are available on the FundedNG MT5 evaluation server. Note: Indices and Gold are particularly prone to gaps and spikes — the weekend-hold and news-trading rules apply equally across all instruments to protect traders.",
              },
              {
                icon: Wallet,
                title: "KYC Before Payout",
                body: "First payout requires verified bank details that match your registered name. Submit them in your Profile and our team will verify within one business day.",
              },
            ].map((r) => (
              <div key={r.title} className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5">
                    <r.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold">{r.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{r.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NGN CTA */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
          <h2 className="font-display text-4xl font-bold">Ready to put the rules to the test?</h2>
          <p className="mt-3 text-muted-foreground">Pick a challenge size and start trading on a FundedNG MT5 evaluation account.</p>
          <Link to="/buy" className="mt-8 inline-block">
            <Button size="lg" className="font-display">Start Challenge <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>
      </section>
      </>)}

      {rulesTab === "USD" && (
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge variant="outline" className="font-display border-blue-400/40 text-blue-500">USD CHALLENGE RULES</Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">Tighter rules for USD challenges</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              USD challenges are a 2-step evaluation with tighter drawdown limits and higher profit requirements — designed for experienced traders who want access to international pricing.
            </p>
          </div>

          {/* 3 Main USD Rule Cards */}
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <div className="rounded-xl border-2 border-blue-400/40 bg-card p-8">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-blue-400/30">01</div>
                <ShieldCheck className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">10% Static Drawdown + 5% Daily</h3>
              <p className="mt-3 text-muted-foreground">
                Your account balance (realized P&amp;L) must never drop more than 10% from your starting balance — not trailing, and based on closed balance rather than floating equity. On top of that, a 5% daily drawdown limit resets at midnight UTC — also measured from balance. Either breach closes the account permanently.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> 10% static drawdown from starting balance (closed balance).</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> 5% daily drawdown resets at midnight UTC.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> Either breach = permanent account closure.</li>
              </ul>
            </div>

            <div className="rounded-xl border-2 border-blue-400/40 bg-card p-8">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-blue-400/30">02</div>
                <TrendingUp className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">5 Profitable Trading Days Per Phase</h3>
              <p className="mt-3 text-muted-foreground">
                You need at least 5 profitable trading days in each phase. A profitable day means your net profit on that calendar day is at least 0.5% of your starting balance. This threshold is fixed — it does not roll upwards as your equity grows.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> {'>='}0.5% net profit on starting balance per day.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> Threshold is fixed, not rolling.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> Progress visible on your Trading Stats dashboard.</li>
              </ul>
            </div>

            <div className="rounded-xl border-2 border-blue-400/40 bg-card p-8">
              <div className="flex items-start justify-between">
                <div className="font-display text-6xl font-bold text-blue-400/30">03</div>
                <Clock className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="font-display mt-4 text-2xl font-bold">3-Minute Minimum Hold (4-Strike)</h3>
              <p className="mt-3 text-muted-foreground">
                Every trade must stay open at least 3 minutes before closing — SL, TP, and manual closes all count. You get 3 warnings, then the 4th short-held trade is an instant breach. Two short-held trades open at the same time is also an instant breach.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> SL, TP, and manual closes all count toward the timer.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> 1st–3rd short-held = warning; 4th = instant breach.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" /> Two simultaneous short-held trades = instant breach.</li>
              </ul>
            </div>
          </div>

          {/* Payout Structure Table */}
          <div className="mt-16">
            <h3 className="font-display text-center text-2xl font-bold">Payout Structure</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">5 payouts maximum per account. Account is retired after the final payout.</p>
            <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left">Payout</th>
                    <th className="px-4 py-3 text-left">Min Profit Required</th>
                    <th className="px-4 py-3 text-left">Amount Paid Out</th>
                    <th className="px-4 py-3 text-left">Trader Receives (80%)</th>
                    <th className="px-4 py-3 text-left">Cooldown</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { payout: "1st", minProfit: ">=6% of starting balance", amount: "6% of starting balance", trader: "4.8% of starting balance", cooldown: "—" },
                    { payout: "2nd", minProfit: ">=6% of starting balance", amount: "6% of starting balance", trader: "4.8% of starting balance", cooldown: "10 business days" },
                    { payout: "3rd", minProfit: ">=10% of starting balance", amount: "10% of starting balance", trader: "8% of starting balance", cooldown: "10 business days" },
                    { payout: "4th", minProfit: ">=10% of starting balance", amount: "10% of starting balance", trader: "8% of starting balance", cooldown: "10 business days" },
                    { payout: "5th (Final)", minProfit: "Any remaining profit", amount: "50% of remaining profit", trader: "40% of remaining profit", cooldown: "10 business days" },
                  ].map((r) => (
                    <tr key={r.payout} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-display font-semibold">{r.payout}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.minProfit}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.amount}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.trader}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.cooldown}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dollar Amount Example Cards */}
          <div className="mt-12 grid gap-4 md:grid-cols-5">
            {[
              { size: "$5k", sizeVal: 5000, first: 240, later: 400 },
              { size: "$10k", sizeVal: 10000, first: 480, later: 800 },
              { size: "$20k", sizeVal: 20000, first: 960, later: 1600 },
              { size: "$50k", sizeVal: 50000, first: 2400, later: 4000 },
              { size: "$100k", sizeVal: 100000, first: 4800, later: 8000 },
            ].map((ex) => (
              <div key={ex.size} className="rounded-xl border border-blue-400/30 bg-card p-4 text-center">
                <div className="font-display text-lg font-bold text-blue-400">{ex.size}</div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div><span className="text-foreground">1st/2nd:</span> ${ex.first}</div>
                  <div><span className="text-foreground">3rd/4th:</span> ${ex.later}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Secondary Rules Grid */}
          <div className="mt-16">
            <h3 className="font-display text-center text-2xl font-bold">Additional USD Account Rules</h3>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[
                {
                  icon: Ban,
                  title: "No Weekend Holding",
                  body: "Non-crypto positions must close before Friday 21:00 UTC. Crypto CFDs are exempt from this rule. Holding over the weekend exposes your account to gap risk that is outside your control.",
                },
                {
                  icon: AlertTriangle,
                  title: "News Trading Restriction",
                  body: "No new trades may be opened 5 minutes before or 5 minutes after any high-impact news event (ForexFactory red folder). Existing open trades are not affected — they can remain open and close normally including via SL/TP.",
                },
                {
                  icon: Clock,
                  title: "Inactivity — 15 Days",
                  body: "Accounts with no trading activity for 15 consecutive days will be automatically closed. At least one trade per 15-day period is required to keep the account active.",
                },
                {
                  icon: CheckCircle2,
                  title: "Allowed Instruments",
                  body: "All FX pairs, Gold, Silver, Indices, and Crypto CFDs are available on the FundedNG MT5 evaluation server. Note: Indices and Gold are prone to gaps and spikes — applicable restrictions apply equally across all instruments.",
                },
                {
                  icon: Ban,
                  title: "Prohibited Strategies",
                  body: "No HFT, arbitrage, cross-account hedging, grid trading, martingale, position stacking (max 2 open positions per symbol; positions opened within 60 seconds count as one), averaging into losing positions, copy trading from other funded accounts, or automated trading (EAs). Hedging within a single account is allowed.",
                },
                {
                  icon: Wallet,
                  title: "KYC Before First Payout",
                  body: "Your first payout requires verified bank or USDT wallet details that match your registered name. Submit them in your Profile dashboard and our team will verify within one business day. Payouts are sent in Naira equivalent via Nigerian bank or USDT.",
                },
              ].map((r) => (
                <div key={r.title} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-blue-400/40">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-blue-400/30 bg-blue-400/10 p-2">
                      <r.icon className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="font-display text-sm font-semibold">{r.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{r.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* USD CTA */}
          <div className="mt-16 text-center">
            <Link to="/buy" search={{ currency: "USD" }} className="inline-block">
              <Button size="lg" className="font-display">Get a USD Account <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>
      )}

      {/* Footer */}
      <footer className="px-4 py-12 text-center md:px-6">
        <Brand />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <Link to="/" className="text-muted-foreground hover:text-primary">Home</Link>
          <Link to="/agreement" className="text-muted-foreground hover:text-primary">Agreement & Risk</Link>
        </div>
        <div className="mt-4 text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} FundedNG. All rights reserved.
        </div>
      </footer>
    </div>
  );
}