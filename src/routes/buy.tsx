import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatNaira, formatUSD, formatCompactSize } from "@/lib/utils";
import { ArrowRight, ShieldCheck, Zap, Wallet, Clock, Layers, Loader2, AlertTriangle, Ban, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/site/Brand";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { NotificationBell } from "@/components/site/NotificationBell";
import { AppSidebar, MobileBottomNav } from "@/components/site/AppShell";

export const Route = createFileRoute("/buy")({
  validateSearch: z.object({
    challenge: z.string().optional(),
    currency: z.enum(["NGN", "USD"]).optional(),
    type: z.enum(["2step", "instant"]).optional(),
    size: z.string().optional(),
  }),
  component: BuyPage,
});

interface Challenge {
  id: string; name: string; account_size: number; price_naira: number;
  profit_target_percent: number; phase2_profit_target_percent?: number | null; max_drawdown_percent: number; phases: number;
  challenge_type?: "standard" | "instant" | null;
  max_daily_drawdown_percent?: number | null;
  max_trading_days?: number | null;
  min_trading_days?: number;
  currency?: string; usd_price?: number; discount_percent?: number;
}

const usdPrices: Record<number, number> = {
  5000: 34,
  10000: 60,
  20000: 90,
  50000: 150,
  100000: 350,
};

const usdSizeOptions: Record<string, number[]> = {
  instant: [5000, 10000, 20000, 50000],
  "1-step": [5000, 10000, 20000, 50000],
  "2-step": [5000, 10000, 20000, 50000, 100000],
};

const usdRules = {
  profitTargetPhase1: 10,
  profitTargetPhase2: 5,
  maxTotalDrawdown: 10,
  dailyDrawdown: 5,
  minProfitableDays: 5,
  profitableDayThreshold: "0.5% of starting balance",
  profitSplit: 80,
  payoutCooldown: "10 business days",
  maxPayouts: 5,
  weekendHolding: false,
  newsRestriction: "5 minutes before/after high-impact events",
  minHoldTime: "3 minutes",
  inactivity: "15 days",
};

function BuyPage() {
  const { isAuthenticated, user, session, profile } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [planType, setPlanType] = useState<"standard" | "instant">("standard");
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState<{ code: string; percent: number } | null>(null);
  const [partnerCode, setPartnerCode] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [challengeType, setChallengeType] = useState<"instant" | "1-step" | "2-step">("2-step");
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  useEffect(() => {
    supabase.from("challenges").select("*").eq("is_active", true).order("account_size")
      .then(({ data }) => {
        const list = (data as Challenge[]) ?? [];
        setChallenges(list);

        // Priority 1: direct challenge id param
        if (search.challenge) {
          const found = list.find((c) => c.id === search.challenge);
          if (found) {
            setSelected(found);
            setSelectedSize(Number(found.account_size));
            setChallengeType(found.challenge_type === "instant" ? "instant" : "2-step");
            setPlanType(found.challenge_type === "instant" ? "instant" : "standard");
            return;
          }
        }

        // Priority 2: currency / type / size params from homepage configurator
        const hasParams = search.currency || search.type || search.size;
        if (hasParams) {
          if (search.currency === "USD" || search.currency === "NGN") setCurrency(search.currency);
          if (search.type === "instant") { setChallengeType("instant"); setPlanType("instant"); }
          else if (search.type === "2step") { setChallengeType("2-step"); setPlanType("standard"); }
          if (search.size) {
            const size = Number(search.size);
            setSelectedSize(size);
            const cur = search.currency || "NGN";
            const match = list.find((c) => c.currency === cur && Number(c.account_size) === size && (search.type === "instant" ? c.challenge_type === "instant" : c.challenge_type !== "instant"));
            if (match) setSelected(match);
          }
          return;
        }

        // Priority 3: default pre-selection (2-step / first or 400k for NGN, first for USD)
        const std = list.filter((c) => c.currency === currency && c.challenge_type !== "instant");
        if (std.length > 0) {
          const target = currency === "NGN"
            ? (std.find((c) => Number(c.account_size) === 400000) || std[0])
            : std[0];
          setSelectedSize(Number(target.account_size));
          setSelected(target);
        }
      });
  }, [search.challenge, search.currency, search.type, search.size]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { setPartnerCode(localStorage.getItem("fng-partner-ref")); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (currency !== "USD") return;
    let cancelled = false;
    const fetchRate = async () => {
      setRateLoading(true);
      try {
        const res = await fetch("/api/exchange-rate");
        const data = await res.json();
        if (!cancelled && data?.rate) {
          setExchangeRate(data.rate);
          setRateUpdatedAt(data.updatedAt ?? null);
        }
      } catch {
        if (!cancelled) setExchangeRate(1550);
      } finally {
        if (!cancelled) setRateLoading(false);
      }
    };
    fetchRate();
    const interval = setInterval(fetchRate, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currency]);

  useEffect(() => {
    if (profile?.partner_referred_by) setPartnerCode("attached");
  }, [profile?.partner_referred_by]);

  const effectivePlanType: "standard" | "instant" =
    challengeType === "2-step" ? "standard" : "instant";

  const handleCurrencyChange = (c: "NGN" | "USD") => {
    setCurrency(c);
    setSelectedSize(null);
    setSelected(null);
    setPromoDiscount(null);
    setError("");
  };

  const handleChallengeTypeChange = (t: "instant" | "1-step" | "2-step") => {
    setChallengeType(t);
    setPlanType(t === "2-step" ? "standard" : "instant");
    setSelectedSize(null);
    setSelected(null);
    setPromoDiscount(null);
    setError("");
  };

  const visibleChallenges = challenges.filter((c) =>
    c.currency === currency &&
    (effectivePlanType === "instant" ? c.challenge_type === "instant" : c.challenge_type !== "instant")
  );

  const handleSizeSelect = (size: number) => {
    setSelectedSize(size);
    setError("");
    const match = visibleChallenges.find((c) => Number(c.account_size) === size);
    if (match) setSelected(match);
  };

  const handleGetFunded = () => {
    if (!selectedSize) return;
    if (!isAuthenticated) {
      navigate({ to: "/auth/register" });
      return;
    }
    setError("");
    setAgreed(false);
    setConfirmOpen(true);
  };

  const openConfirm = () => {
    if (!selected) return setError("Select a challenge first");
    if (!isAuthenticated) {
      navigate({ to: "/auth/register" });
      return;
    }
    setError("");
    setAgreed(false);
    setConfirmOpen(true);
  };

  const validatePromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return setPromoDiscount(null);
    if (!selected) return toast.error("Select a challenge first");

    const { data, error } = await supabase.rpc("validate_discount_code" as any, { _code: code, _challenge_id: selected.id });
    const row = Array.isArray(data) ? data[0] : null;
    if (!error && row) {
      setPromoDiscount({ code: row.code, percent: Number(row.percent_off) });
      toast.success(`${row.percent_off}% discount applied`);
      return;
    }

    if (!partnerCode) {
      const { data: partnerValid } = await supabase.rpc("validate_partner_code" as any, { _code: code });
      if (partnerValid) {
        setPromoDiscount(null);
        setPartnerCode(code);
        toast.success("Partner code applied: 15% off");
        return;
      }
    }

    setPromoDiscount(null);
    toast.error("Promo code is invalid or expired");
  };

  const effectivePrice = currency === "USD" ? (selected?.usd_price ?? 0) : (selected?.price_naira ?? 0);
  const partnerDiscountPercent = partnerCode ? 15 : 0;
  const promoDiscountPercent = promoDiscount?.percent ?? 0;
  const challengeDiscountPercent = selected?.discount_percent ?? 0;
  const discountPercent = promoDiscountPercent > 0 ? promoDiscountPercent : (partnerDiscountPercent > 0 ? partnerDiscountPercent : challengeDiscountPercent);
  const discountAmount = selected ? Math.floor(Number(effectivePrice) * discountPercent / 100) : 0;
  const payable = selected ? Math.max(0, Number(effectivePrice) - discountAmount) : 0;

  const handleBuy = async () => {
    if (!selected) return;
    if (!user?.email) {
      setError("You need to be signed in with an email.");
      return;
    }
    if (!session?.access_token) {
      setError("Your session expired. Please sign in again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const challengeId = selected!.id;
      // Initialize the transaction server-side and redirect to Squad's
      // hosted checkout page. After payment, Squad redirects the user to
      // /payment/callback, which calls /api/verify-payment to finalize.
      const res = await fetch("/api/initialize-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
          body: JSON.stringify({ challenge_id: challengeId, discount_code: promoDiscount?.code, partner_promo_code: partnerCode, currency, exchange_rate: exchangeRate }),
      });
      const result = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        authorization_url?: string;
        free?: boolean;
        order_id?: string;
        error?: string;
      };
      if (!res.ok || !result.ok) {
        setLoading(false);
        setError(result.error ?? "Could not start payment");
        return;
      }
      // 100 % discount → free order, no Paystack redirect
      if (result.free && result.order_id) {
        setLoading(false);
        setConfirmOpen(false);
        toast.success("Challenge acquired! Your account is being prepared.");
        fetch("/api/notify-new-purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: result.order_id }),
          keepalive: true,
        }).catch(() => {});
        navigate({ to: "/dashboard" });
        return;
      }
      if (!result.authorization_url) {
        setLoading(false);
        setError("Could not start payment");
        return;
      }
      toast.message("Redirecting to checkout…");
      window.location.href = result.authorization_url;
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : "Could not start payment");
    }
  };

  return (
    <div className="min-h-screen md:flex">
      {/* Authenticated visitors get the persistent sidebar + bottom nav so
          /buy stays inside the app shell exactly like every other signed-in
          page. Guests get a lightweight sticky public header. */}
      {isAuthenticated && <AppSidebar />}

      <div className={`min-w-0 flex-1 ${isAuthenticated ? "md:ml-60" : ""}`}>
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
          <div className={isAuthenticated ? "md:hidden" : ""}>
            <Brand />
          </div>
          {isAuthenticated && <div className="hidden md:block" />}
          <div className="flex items-center gap-1 md:gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <NotificationBell />
            ) : (
              <>
                <Link
                  to="/auth/login"
                  className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
                >
                  Sign In
                </Link>
                <Button asChild size="sm" className="font-display">
                  <Link to="/auth/register">Get Funded</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        <main className={isAuthenticated ? "pb-24 md:pb-0" : ""}>
          <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
            <div className="text-center">
              <Badge variant="outline" className="font-display border-primary/40 text-primary">SELECT YOUR CHALLENGE</Badge>
              <h1 className="font-display mt-4 text-4xl font-bold">Get Funded Today</h1>
              <p className="mt-2 text-muted-foreground">Choose your challenge parameters and get funded to trade.</p>
            </div>

            <div className="mt-10 flex flex-col gap-8 lg:flex-row">
              {/* ========== LEFT: Configurator Pills ========== */}
              <div className="flex-1 space-y-8">

                {/* --- Currency Toggle --- */}
                <div>
                  <label className="font-display mb-3 block text-xs tracking-widest text-muted-foreground">CURRENCY</label>
                  <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange("NGN")}
                      className={`font-display rounded-full px-6 py-2 text-xs tracking-wider transition-all ${currency === "NGN" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      NGN
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCurrencyChange("USD")}
                      className={`font-display rounded-full px-6 py-2 text-xs tracking-wider transition-all ${currency === "USD" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      USD
                    </button>
                  </div>
                </div>

                {/* --- Challenge Type --- */}
                <div>
                  <label className="font-display mb-3 block text-xs tracking-widest text-muted-foreground">CHALLENGE TYPE</label>
                  <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
                    {(["instant", "1-step", "2-step"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleChallengeTypeChange(t)}
                        className={`font-display rounded-full px-5 py-2 text-xs tracking-wider transition-all ${challengeType === t ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {t === "instant" ? "INSTANT" : t === "1-step" ? "1-STEP" : "2-STEP"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --- Account Size --- */}
                <div>
                  <label className="font-display mb-3 block text-xs tracking-widest text-muted-foreground">ACCOUNT SIZE</label>
                  <div className="flex flex-wrap gap-2">
                    {visibleChallenges.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSizeSelect(Number(c.account_size))}
                        className={`font-display rounded-full border px-5 py-2 text-xs tracking-wider transition-all ${selectedSize === Number(c.account_size) ? "border-primary bg-primary text-primary-foreground shadow" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                      >
                        {formatCompactSize(Number(c.account_size), currency)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --- Promo & Pricing (inline) --- */}
                {selected && (
                  <div className="rounded-xl border border-primary/30 bg-card p-6 animate-fade-in">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Challenge</span>
                        <span className="font-medium">{selected.name} — {currency === "NGN" ? formatNaira(selected.account_size) : formatUSD(selected.account_size)}</span>
                      </div>
                      {currency === "USD" && (
                        <div className="flex justify-between border-t border-border pt-3">
                          <span className="text-muted-foreground">Exchange Rate</span>
                          <span className="font-display text-sm">
                            {rateLoading ? "Loading..." : exchangeRate ? `₦${exchangeRate.toLocaleString()}/$` : "—"}
                          </span>
                        </div>
                      )}
                      {partnerCode && (
                        <div className="flex justify-between border-t border-border pt-3 text-sm">
                          <span className="text-muted-foreground">Partner link discount</span>
                          <span className="font-display text-primary">15% off</span>
                        </div>
                      )}
                      {challengeDiscountPercent > 0 && (
                        <div className="flex justify-between border-t border-border pt-3 text-sm">
                          <span className="text-muted-foreground">Challenge discount</span>
                          <span className="font-display text-primary">{challengeDiscountPercent}% off</span>
                        </div>
                      )}
                      <div className="border-t border-border pt-3">
                        <div className="flex gap-2">
                          <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Promo code" className="h-9" />
                          <Button type="button" size="sm" variant="outline" onClick={validatePromo}>Apply</Button>
                        </div>
                        {promoDiscount && <div className="mt-1 text-xs text-primary">{promoDiscount.code}: {promoDiscount.percent}% off applied</div>}
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between border-t border-border pt-3">
                          <span className="text-muted-foreground">Discount</span>
                          <span className="font-display text-primary">{currency === "NGN" ? `-${formatNaira(discountAmount)}` : `-${formatUSD(discountAmount)}`}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-3">
                        <span className="text-muted-foreground">{currency === "USD" ? "Total (USD)" : "Total"}</span>
                        <span className="font-display text-xl font-bold text-primary">{currency === "NGN" ? formatNaira(payable) : formatUSD(payable)}</span>
                      </div>
                      {currency === "USD" && exchangeRate && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>NGN equivalent</span>
                          <span>{formatNaira(Math.ceil(payable * exchangeRate))}</span>
                        </div>
                      )}

                    </div>
                    {currency === "USD" && (
                      <p className="mt-3 text-center text-[11px] text-muted-foreground">
                        Price shown in Naira equivalent at today's live USD/NGN rate. Paid via Squad.
                      </p>
                    )}
                    {error && <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
                    <Button className="font-display mt-5 w-full" size="lg" onClick={handleGetFunded} disabled={loading || (currency === "USD" && rateLoading)}>
                      {loading ? "Processing..." : <>{currency === "NGN" ? `Pay ${formatNaira(payable)} Now` : "Continue"} <ArrowRight className="ml-2 h-4 w-4" /></>}
                    </Button>
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      By continuing you agree to our <Link to="/agreement" className="text-primary hover:underline">trader agreement</Link> and acknowledge the risk disclosure.
                    </p>
                  </div>
                )}

                {!selected && visibleChallenges.length === 0 && (
                  <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    No {currency} {effectivePlanType === "instant" ? "Instant" : "Standard"} challenges available right now.
                  </div>
                )}
              </div>

              {/* ========== RIGHT: Account Summary Card ========== */}
              <div className="w-full lg:w-80 xl:w-96">
                <div className="sticky top-24 rounded-xl border border-border bg-card p-6">
                  <div className="font-display mb-4 text-lg font-bold">Account Summary</div>

                  {!selectedSize ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
                      <Layers className="mb-2 h-8 w-8 opacity-40" />
                      <span>Select your options above to see the summary</span>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {/* Account Size */}
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Account Size</span>
                        <span className="font-display font-semibold">
                          {currency === "NGN" ? formatNaira(selectedSize) : formatUSD(selectedSize)}
                        </span>
                      </div>

                      {/* Challenge Fee */}
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Challenge Fee</span>
                        <span className="font-display font-semibold text-primary">
                          {selected ? (currency === "NGN" ? formatNaira(payable) : formatUSD(payable)) : (currency === "NGN" ? formatNaira(0) : formatUSD(0))}
                        </span>
                      </div>

                      {/* Profit Targets */}
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Profit Target Phase 1</span>
                        <span className="font-display font-semibold">
                          {`${selected?.profit_target_percent ?? 0}%`}
                        </span>
                      </div>

                      {challengeType === "2-step" && (
                        <div className="flex items-center justify-between border-b border-border pb-2">
                          <span className="text-muted-foreground">Profit Target Phase 2</span>
                          <span className="font-display font-semibold">
                            {`${selected?.phase2_profit_target_percent ?? selected?.profit_target_percent ?? 0}%`}
                          </span>
                        </div>
                      )}

                      {/* Max Drawdown (Trailing) */}
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Max Drawdown (Trailing)</span>
                        <span className="font-display font-semibold">
                          {`${selected?.max_drawdown_percent ?? 0}%`}
                        </span>
                      </div>

                      {/* Daily Drawdown — all NGN challenges */}
                      {currency === "NGN" && (
                        <div className="flex items-center justify-between border-b border-border pb-2">
                          <span className="text-muted-foreground">Daily Drawdown</span>
                          <span className="font-display font-semibold">
                            {`${selected?.max_daily_drawdown_percent ?? 10}%`}
                          </span>
                        </div>
                      )}

                      {/* Min Trading Days */}
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Min Trading Days</span>
                        <span className="font-display font-semibold">
                          {currency === "USD" ? "5" : `${selected?.min_trading_days ?? 3}`}
                        </span>
                      </div>

                      {/* Profit Split */}
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Profit Split</span>
                        <span className="font-display font-semibold">80%</span>
                      </div>

                      {/* Payouts */}
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Payouts</span>
                        <span className="font-display font-semibold">
                          {currency === "USD" ? "Max 5 (10 business day cooldown)" : "Within 24 hrs"}
                        </span>
                      </div>

                      {/* Get Funded Button */}
                      <Button
                        className="font-display mt-4 w-full"
                        size="lg"
                        onClick={handleGetFunded}
                        disabled={!selectedSize || loading}
                      >
                        {currency === "NGN" ? "Get Funded" : "Get Funded"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>

                      <p className="text-center text-xs text-muted-foreground">
                        You will be redirected to complete payment via Squad.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {isAuthenticated && <MobileBottomNav />}

      <Dialog open={confirmOpen} onOpenChange={(o) => !loading && setConfirmOpen(o)}>
        <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-lg">
          {(() => {
            const confirmCurrency = currency;
            const confirmSize = selectedSize;
            const confirmPrice = currency === "NGN"
              ? payable
              : exchangeRate
                ? Math.ceil(payable * exchangeRate)
                : 0;
            const confirmLabel = currency === "NGN"
              ? formatNaira(confirmSize ?? 0)
              : formatUSD(confirmSize ?? 0);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">
                    {selected?.name ?? "Challenge"}
                  </DialogTitle>
                  <DialogDescription>
                    <span className="font-display block text-3xl font-bold text-primary">
                      {confirmLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">account size</span>
                  </DialogDescription>
                </DialogHeader>

                {selected !== null && (
                <div className="space-y-3 rounded-lg border border-border bg-background/50 p-4 text-sm">
                  {(selected?.challenge_type === "instant"
                      ? [
                          { icon: ShieldCheck, label: "Profit target", value: `${selected?.profit_target_percent ?? 0}%` },
                          { icon: Zap, label: "Max total drawdown", value: `${selected?.max_drawdown_percent ?? 0}%` },
                          { icon: AlertTriangle, label: "Daily drawdown", value: `${selected?.max_daily_drawdown_percent ?? 10}%` },
                          { icon: Clock, label: "Trading window", value: `5 – ${selected?.max_trading_days ?? 45} days` },
                          { icon: Layers, label: "Phases", value: "1-Step (Instant)" },
                          { icon: Wallet, label: "Profit split", value: "80%" },
                        ]
                      : currency === "USD"
                        ? [
                            { icon: ShieldCheck, label: "Profit target Phase 1", value: "10%" },
                            { icon: ShieldCheck, label: "Profit target Phase 2", value: "5%" },
                            { icon: Zap, label: "Max drawdown (static)", value: "10%" },
                            { icon: AlertTriangle, label: "Daily drawdown", value: "5%" },
                            { icon: Clock, label: "Min hold time", value: "3 minutes" },
                            { icon: TrendingUp, label: "Profitable days required", value: "5 days (>=0.5% each)" },
                            { icon: Wallet, label: "Profit split", value: "80/20" },
                            { icon: Clock, label: "Payout cooldown", value: "10 business days" },
                            { icon: Layers, label: "Max payouts", value: "5 total" },
                            { icon: Ban, label: "Weekend holding", value: "Not allowed" },
                            { icon: Ban, label: "News trading", value: "+/-5 min blackout" },
                          ]
                        : [
                          { icon: ShieldCheck, label: "Profit target / phase", value: selected?.phase2_profit_target_percent ? `${selected?.profit_target_percent ?? 0}% / ${selected?.phase2_profit_target_percent}%` : `${selected?.profit_target_percent ?? 0}%` },
                          { icon: Zap, label: "Max drawdown", value: `${selected?.max_drawdown_percent ?? 0}%` },
                          { icon: AlertTriangle, label: "Daily drawdown", value: `${selected?.max_daily_drawdown_percent ?? 10}%` },
                          { icon: Layers, label: "Phases to funded", value: `${selected?.phases ?? 2}` },
                          { icon: Clock, label: "Min trading days", value: `${selected?.min_trading_days ?? 3}` },
                          { icon: Wallet, label: "Profit split", value: "80%" },
                          { icon: Clock, label: "Payout processing", value: "Within 24 hrs" },
                        ]
                  ).map((r) => (
                    <div key={r.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <r.icon className="h-4 w-4 text-primary" /> {r.label}
                      </span>
                      <span className="font-display font-semibold">{r.value}</span>
                    </div>
                  ))}
                </div>
                )}

                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                  <span className="font-display block font-semibold text-warning">Rules reminder</span>
                    {currency === "USD"
                      ? "USD accounts: Min 3-minute hold on all trades (SL, TP, manual). Max 2 positions per symbol; no averaging into losers. 10% static drawdown from starting balance (based on closed balance, not floating equity). 5% daily drawdown (resets midnight UTC). No weekend holding — all positions must close before Friday 21:00 UTC (crypto exempt). News blackout: 5 minutes before/after high-impact events. 5 profitable trading days required per phase — each day must show >=0.5% net profit on your starting balance. Max 5 payouts per account. 10 business days between payouts. Inactivity limit: 15 days."
                      : "Trade only on your FundedNG MT5 evaluation account. No automated trading. No copy trading. All trades must be held at least 3 minutes (manual, SL, and TP closes all count). Max 2 positions per symbol; no averaging into losers. 20% trailing drawdown based on closed balance (from the highest balance reached — floating losses don't count). 10% max daily loss from the day's highest balance (resets midnight UTC). Profit target is measured on closed balance."}
                </div>

                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background/50 p-3 text-xs">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-muted-foreground">
                    I have read and agree to the{" "}
                    <Link to="/agreement" className="text-primary hover:underline" target="_blank">
                      FundedNG trader agreement & risk disclosure
                    </Link>
                    .
                  </span>
                </label>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <span className="text-sm text-muted-foreground">Total due</span>
                  <span className="font-display text-2xl font-bold text-primary">
                    {currency === "NGN" ? formatNaira(confirmPrice) : `${formatUSD(payable)} (${formatNaira(confirmPrice)})`}
                  </span>
                </div>

                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
                    Cancel
                  </Button>
                  <Button className="font-display" onClick={handleBuy} disabled={loading || !agreed}>
                    {loading ? "Processing…" : <>Confirm & Pay {currency === "NGN" ? formatNaira(confirmPrice) : formatUSD(payable)} <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}