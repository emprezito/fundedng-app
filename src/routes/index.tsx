import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicHeader } from "@/components/site/PublicHeader";
import { Brand } from "@/components/site/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNaira, formatUSD, formatCompactSize } from "@/lib/utils";
import SocialProofGallery from "@/components/site/SocialProofGallery";
import { Zap, ShieldCheck, Trophy, ArrowRight, Clock, Ban } from "lucide-react";
import tradingChartHero from "@/assets/trading-chart-hero.jpg";
import tradingChartHeroDark from "@/assets/trading-chart-hero-dark.jpg";
import fundedngElement from "@/assets/fundedng-element.png";

export const Route = createFileRoute("/")({ component: Index });

interface Challenge {
  id: string; name: string; account_size: number; price_naira: number; discount_percent?: number | null;
  profit_target_percent: number; max_drawdown_percent: number; phases: number;
  challenge_type?: "standard" | "instant" | null;
  max_daily_drawdown_percent?: number | null;
  max_trading_days?: number | null;
}

function Index() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);

  useEffect(() => {
    // If running as installed PWA, send the user straight to the dashboard.
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches
    ) {
      window.location.replace("/dashboard");
      return;
    }
    supabase.from("challenges").select("*").eq("is_active", true).order("account_size")
      .then(({ data }) => setChallenges((data as Challenge[]) ?? []));
  }, []);

  const standardChallenges = challenges.filter((c) => c.challenge_type !== "instant");
  const instantChallenges = challenges.filter((c) => c.challenge_type === "instant");

  return (
    <div className="min-h-screen">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={tradingChartHero}
          alt="Live trading candlestick chart with upward trend"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover opacity-60 dark:hidden"
        />
        <img
          src={tradingChartHeroDark}
          alt=""
          aria-hidden="true"
          width={1920}
          height={1080}
          className="absolute inset-0 hidden h-full w-full object-cover opacity-80 dark:block"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background" />
        <div className="absolute inset-0 gradient-radial-primary opacity-40" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-28 lg:py-32">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* Left: copy */}
            <div className="lg:text-left animate-reveal-up">
              <div className="font-display mb-6 text-xs tracking-[0.4em] text-primary opacity-80 lg:text-left text-center">
                NIGERIA'S PROP TRADING FIRM
              </div>
              <h1 className="font-display text-4xl font-bold leading-[1.05] md:text-6xl lg:text-7xl xl:text-8xl">
                Trade our Capital
                <br />
                <span className="text-primary text-glow">and Get Funded in Naira.</span>
              </h1>
              <p className="mt-4 max-w-xl font-display text-base tracking-wide text-primary md:text-lg lg:text-left text-center">
                The Best Prop-Firm for 9ja traders wey sabi
              </p>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base lg:text-left text-center">
                Pass two phases. Get funded. Withdraw 24 hours after your payout
                is approved — no wahala.
              </p>

              <div className="mt-12 grid max-w-2xl grid-cols-2 gap-6 lg:grid-cols-4 lg:text-left text-center">
                {[["24h","Payouts"],["80%","Profit Split"],["3","Simple Rules"],["₦2M","Max Funding"]].map(([v,l]) => (
                  <div key={l}>
                    <div className="font-display text-3xl font-bold text-primary">{v}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Link to="/buy">
                  <Button size="lg" className="font-display animate-pulse-glow">
                    Start Challenge <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/auth/register">
                  <Button size="lg" variant="outline">Create Account</Button>
                </Link>
              </div>
            </div>

            {/* Right: animated phone/dashboard element (desktop only) */}
            <div className="relative hidden items-center justify-center lg:flex">
              <div className="absolute h-[520px] w-[340px] rounded-[2.5rem] bg-primary/30 blur-3xl" />
              <img
                src={fundedngElement}
                alt="FundedNG funded account dashboard on a phone"
                width={1024}
                height={1536}
                className="animate-float relative h-[480px] w-auto max-w-full object-contain drop-shadow-[0_40px_60px_rgba(0,0,0,0.45)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Gallery */}
      <SocialProofGallery />

      {/* Leaderboard CTA */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-3xl px-4 py-12 text-center md:px-6">
          <p className="text-muted-foreground">Want more proof?</p>
          <h2 className="font-display mt-2 text-2xl font-bold">Watch Our Live Leaderboard & Payouts</h2>
          <p className="mt-2 text-sm text-muted-foreground">See real traders earning real money — updated in real time.</p>
          <Link to="/leaderboard" className="mt-6 inline-block">
            <Button size="lg" variant="outline" className="font-display">
              View Live Leaderboard <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Challenge Configurator */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge variant="outline" className="font-display border-primary/40 text-primary">FIND YOUR MATCH</Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">Find Your Perfect Challenge</h2>
            <p className="mt-2 text-muted-foreground">Select your preferences and get started in minutes</p>
          </div>

          <HomepageConfigurator
            standardChallenges={standardChallenges}
            instantChallenges={instantChallenges}
          />
        </div>
      </section>

      {/* Rules */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center md:px-6">
          <Badge variant="outline" className="font-display border-primary/40 text-primary">THE RULES</Badge>
          <h2 className="font-display mt-4 text-4xl font-bold">Just 3 Rules. That's It.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { num: "01", title: "Max 20% Drawdown (Balance Trailing)", desc: "Your account balance must never drop more than 20% from the highest balance reached — floating losses don't count. Plus a 10% daily loss limit from the day's highest balance.", icon: ShieldCheck },
              { num: "02", title: "No Tick Scalping", desc: "Each trade must be held at least 3 minutes — breached on the 4th detection. Two short trades at the same time is an instant breach.", icon: Clock },
              { num: "03", title: "Trade at Least Once a Week", desc: "At least 1 trade every calendar week to stay active. Profits across 3+ trading days per phase.", icon: Zap },
            ].map((r) => (
              <div key={r.num} className="rounded-xl border border-border bg-card p-8 text-left transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between">
                  <div className="font-display text-5xl font-bold text-primary/30">{r.num}</div>
                  <r.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 text-xl font-semibold">{r.title}</h3>
                <p className="mt-2 text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            See our{" "}
            <Link to="/rules" className="text-primary font-semibold hover:underline">
              full rules
            </Link>{" "}
            to learn more about weekend holding, news trading restrictions, allowed instruments, and more.
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
          <Trophy className="mx-auto h-12 w-12 text-primary" />
          <h2 className="font-display mt-6 text-4xl font-bold">Ready to get funded?</h2>
          <p className="mt-3 text-muted-foreground">Join hundreds of Nigerian traders earning real payouts.</p>
          <Link to="/buy" className="mt-8 inline-block">
            <Button size="lg" className="font-display">Start Now <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 text-center md:px-6">
        <Brand />
        <p className="mx-auto mt-4 max-w-2xl text-xs text-muted-foreground">
          FundedNG is a proprietary trading evaluation platform. Challenge fees
          fund operational costs. All evaluations run on FundedNG MT5 evaluation
          accounts — you trade real-market prices in a controlled evaluation
          environment. Past performance does not guarantee future results.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <Link to="/rules" className="text-muted-foreground hover:text-primary">Rules</Link>
          <Link to="/agreement" className="text-muted-foreground hover:text-primary">Agreement & Risk</Link>
        </div>
        <div className="mt-4 text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} FundedNG. All rights reserved.
        </div>
      </footer>

    </div>
  );
}

const fallbackStandard: Challenge[] = [
  { id:"1", name:"Starter", account_size:200000, price_naira:7500, profit_target_percent:10, max_drawdown_percent:20, max_daily_drawdown_percent:10, phases:2 },
  { id:"2", name:"Growth", account_size:500000, price_naira:17500, profit_target_percent:10, max_drawdown_percent:20, max_daily_drawdown_percent:10, phases:2 },
  { id:"3", name:"Pro", account_size:1000000, price_naira:32000, profit_target_percent:10, max_drawdown_percent:20, max_daily_drawdown_percent:10, phases:2 },
  { id:"4", name:"Elite", account_size:2000000, price_naira:60000, profit_target_percent:10, max_drawdown_percent:20, max_daily_drawdown_percent:10, phases:2 },
];

const fallbackInstant: Challenge[] = [
  { id:"i1", name:"Instant 1.5M", account_size:1500000, price_naira:120000, profit_target_percent:15, max_drawdown_percent:20, phases:1, max_daily_drawdown_percent:10, max_trading_days:45 },
  { id:"i2", name:"Instant 2M", account_size:2000000, price_naira:155000, profit_target_percent:15, max_drawdown_percent:20, phases:1, max_daily_drawdown_percent:10, max_trading_days:45 },
  { id:"i3", name:"Instant 3M", account_size:3000000, price_naira:225000, profit_target_percent:15, max_drawdown_percent:20, phases:1, max_daily_drawdown_percent:10, max_trading_days:45 },
];

const usdSizes: Record<string, number[]> = {
  "2-step": [5000, 10000, 25000, 50000, 100000],
  instant: [5000, 10000, 25000, 50000],
};

const usdPrices: Record<number, number> = {
  5000: 19, 10000: 45, 25000: 99, 50000: 199, 100000: 349,
};

function HomepageConfigurator({ standardChallenges, instantChallenges }: { standardChallenges: Challenge[]; instantChallenges: Challenge[] }) {
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [challengeType, setChallengeType] = useState<"2-step" | "instant">("2-step");
  const [selectedSize, setSelectedSize] = useState<number>(0);

  const stdList = standardChallenges.length > 0 ? standardChallenges : fallbackStandard;
  const instList = instantChallenges.length > 0 ? instantChallenges : fallbackInstant;

  const sizes = currency === "NGN"
    ? (challengeType === "2-step" ? stdList : instList).map(c => Number(c.account_size))
    : usdSizes[challengeType];

  useEffect(() => {
    if (sizes.length === 0) return;
    const def = currency === "NGN" ? (sizes.includes(400000) ? 400000 : sizes[0]) : 10000;
    if (selectedSize === 0 || !sizes.includes(selectedSize)) {
      setSelectedSize(def);
    }
  }, [currency, challengeType, sizes.length]);

  const selectedChallenge = currency === "NGN"
    ? (challengeType === "2-step" ? stdList : instList).find(c => Number(c.account_size) === selectedSize)
    : null;

  const fee = currency === "NGN"
    ? (selectedChallenge?.price_naira ?? 0)
    : (selectedSize ? usdPrices[selectedSize] ?? 0 : 0);

  const searchParams = {
    currency,
    type: challengeType === "2-step" ? "2step" : "instant",
    size: String(selectedSize),
  };

  return (
    <div className="mt-10 space-y-8">
      {/* Currency */}
      <div>
        <label className="font-display mb-3 block text-xs tracking-widest text-muted-foreground">CURRENCY</label>
        <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
          {(["NGN", "USD"] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCurrency(c)}
              className={`font-display rounded-full px-6 py-2 text-xs tracking-wider transition-all ${currency === c ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Challenge Type */}
      <div>
        <label className="font-display mb-3 block text-xs tracking-widest text-muted-foreground">CHALLENGE TYPE</label>
        <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
          {([["2-step", "2-STEP"], ["instant", "INSTANT"]] as const).map(([val, label]) => (
            <button key={val} type="button" onClick={() => setChallengeType(val)}
              className={`font-display rounded-full px-5 py-2 text-xs tracking-wider transition-all ${challengeType === val ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Account Size */}
      <div>
        <label className="font-display mb-3 block text-xs tracking-widest text-muted-foreground">ACCOUNT SIZE</label>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => (
            <button key={s} type="button" onClick={() => setSelectedSize(s)}
              className={`font-display rounded-full border px-5 py-2 text-xs tracking-wider transition-all ${selectedSize === s ? "border-primary bg-primary text-primary-foreground shadow" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
            >
              {formatCompactSize(s, currency)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Card */}
      <div className="mx-auto max-w-md">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="font-display mb-5 text-lg font-bold text-center">Challenge Summary</div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Account Size</span>
              <span className="font-display font-semibold">{currency === "NGN" ? formatNaira(selectedSize) : formatUSD(selectedSize)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Challenge Fee</span>
              <span className="font-display font-semibold text-primary">{currency === "NGN" ? formatNaira(fee) : formatUSD(fee)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Profit Split</span>
              <span className="font-display font-semibold">80%</span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Payouts</span>
              <span className="font-display font-semibold">Weekly</span>
            </div>
          </div>
          <Link to="/buy" search={searchParams} className="mt-5 block">
            <Button className="w-full font-display" size="lg">
              Start This Challenge <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
