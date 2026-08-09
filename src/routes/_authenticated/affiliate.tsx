import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatNaira } from "@/lib/utils";
import { toast } from "sonner";
import { Copy, Users, Wallet, Gift, Send, Share2 } from "lucide-react";
import { RefreshButton } from "@/components/ui/refresh-button";

export const Route = createFileRoute("/_authenticated/affiliate")({
  component: AffiliatePage,
});

interface AffiliateProfile {
  code: string;
  total_earned_naira: number;
  total_paid_naira: number;
  free_accounts_credited: number;
  free_accounts_claimed: number;
}
interface Referral { id: string; referred_user_id: string; first_paid_at: string | null; created_at: string; }
interface Commission { id: string; order_id: string; amount_naira: number; status: string; created_at: string; }
interface Payout { id: string; amount_naira: number; status: string; requested_at: string; }
interface FreeAccount {
  id: string;
  status: string;
  referral_batch: number;
  account_size: number | null;
  challenge_name: string | null;
  mt5_login: string | null;
  mt5_password: string | null;
  investor_password: string | null;
  mt5_server: string | null;
  fulfilled_at: string | null;
  created_at: string;
}

function AffiliatePage() {
  const { user, profile } = useAuth();
  const [ap, setAp] = useState<AffiliateProfile | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [freeAccounts, setFreeAccounts] = useState<FreeAccount[]>([]);
  const [pendingReserved, setPendingReserved] = useState(0);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const load = async () => {
    if (!user) return;
    const [a, r, c, p, fa] = await Promise.all([
      supabase.from("affiliate_profiles").select("code,total_earned_naira,total_paid_naira,free_accounts_credited,free_accounts_claimed").eq("user_id", user.id).maybeSingle(),
      supabase.from("referrals").select("*").eq("referrer_id", user.id).order("created_at", { ascending: false }),
      supabase.from("affiliate_commissions").select("*").eq("affiliate_user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("affiliate_payouts").select("*").eq("user_id", user.id).order("requested_at", { ascending: false }),
      supabase.from("affiliate_free_accounts").select("*").eq("affiliate_id", user.id).order("created_at", { ascending: false }),
    ]);
    setAp((a.data as AffiliateProfile | null) ?? null);
    setReferrals((r.data as Referral[]) ?? []);
    setCommissions((c.data as Commission[]) ?? []);
    const list = (p.data as Payout[]) ?? [];
    setPayouts(list);
    setPendingReserved(list.filter((x) => ["pending","approved"].includes(x.status)).reduce((s,x)=>s+Number(x.amount_naira),0));
    setFreeAccounts((fa.data as FreeAccount[]) ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const refLink = ap ? `${origin}/?ref=${ap.code}` : "";

  const copy = async (text: string, label = "Copied!") => {
    try { await navigator.clipboard.writeText(text); toast.success(label); }
    catch { toast.error("Copy failed"); }
  };

  const share = async () => {
    if (!refLink) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Join FundedNG", text: "Get funded to trade — use my referral link", url: refLink }); return; }
      catch { /* fall through */ }
    }
    copy(refLink, "Referral link copied!");
  };

  const balance = ap ? ap.total_earned_naira - ap.total_paid_naira - pendingReserved : 0;
  const freeAvailable = ap ? ap.free_accounts_credited - ap.free_accounts_claimed : 0;
  const paidReferrals = referrals.filter((r) => r.first_paid_at).length;

  const requestPayout = async () => {
    const amt = Number(amount.replace(/[^0-9]/g, ""));
    if (!amt || amt < 5000) return toast.error("Minimum payout is ₦5,000");
    if (amt > balance) return toast.error("Amount exceeds available balance");
    if (!profile?.bank_account_number) return toast.error("Add your bank details on the dashboard first.");
    setSubmitting(true);
    const { error } = await supabase.rpc("request_affiliate_payout", { _amount: amt });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Payout requested. Processed within 24hrs of approval.");
    setAmount("");
    load();
  };

  const claimFree = async () => {
    if (freeAvailable <= 0) return;
    setClaiming(true);
    const { error } = await supabase.rpc("claim_free_account");
    setClaiming(false);
    if (error) return toast.error(error.message);
    toast.success("Free 200k account requested. Admin will provision it shortly.");
    load();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Affiliate Program</h1>
          <p className="text-sm text-muted-foreground">Earn 10% on every sale you refer. Get a free 200k challenge for every 5 paid referrals.</p>
        </div>
        <RefreshButton onRefresh={async () => { await load(); toast.success("Affiliate data updated"); }} />
      </div>

      {/* Referral link */}
      <div className="rounded-2xl border border-primary/40 bg-card p-6">
        <div className="font-display text-sm font-semibold text-primary">YOUR REFERRAL LINK</div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={refLink} className="flex-1 font-mono text-xs" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => copy(refLink, "Link copied!")}><Copy className="mr-1 h-4 w-4"/>Copy</Button>
            <Button onClick={share}><Share2 className="mr-1 h-4 w-4"/>Share</Button>
          </div>
        </div>
        {ap && (
          <p className="mt-3 text-xs text-muted-foreground">Your code: <span className="font-mono font-bold text-foreground">{ap.code}</span> · Works on every domain we use, now and in the future.</p>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Paid Referrals" value={paidReferrals.toString()} sub={`${referrals.length} total referred`} />
        <Stat icon={Wallet} label="Available" value={formatNaira(Math.max(0, balance))} sub="Min ₦5,000 to withdraw" />
        <Stat icon={Send} label="Total earned" value={formatNaira(ap?.total_earned_naira ?? 0)} sub={`Paid: ${formatNaira(ap?.total_paid_naira ?? 0)}`} />
        <Stat icon={Gift} label="Free 200k accounts" value={`${freeAvailable}`} sub={`${ap?.free_accounts_claimed ?? 0} claimed · 5 per 5 referrals`} />
      </div>

      {/* Free account claim */}
      {freeAvailable > 0 && (
        <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-base font-bold">🎁 You have {freeAvailable} free 200k challenge account{freeAvailable>1?"s":""} available</div>
              <p className="mt-1 text-sm text-muted-foreground">1 free account per 5 paid referrals · max 5 lifetime · admin will deliver MT5 credentials shortly after you claim.</p>
            </div>
            <Button onClick={claimFree} disabled={claiming} className="font-display"><Gift className="mr-1 h-4 w-4"/>{claiming ? "Claiming..." : "Claim 1 Free Account"}</Button>
          </div>
        </div>
      )}

      {/* Delivered & pending free accounts */}
      {freeAccounts.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <div className="font-display text-base font-bold">Your Free Account Claims</div>
          <div className="mt-3 divide-y divide-border">
            {freeAccounts.map((fa) => (
              <div key={fa.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display font-semibold">Batch #{fa.referral_batch} · {formatNaira(fa.account_size ?? 200000)}</div>
                  <Badge variant="outline" className="capitalize">{fa.status}</Badge>
                </div>
                {fa.status === "fulfilled" && fa.mt5_login ? (
                  <div className="mt-2 grid gap-1 rounded-md border border-border bg-background p-3 font-mono text-xs">
                    <div>Login: <span className="font-bold text-foreground">{fa.mt5_login}</span></div>
                    <div>Server: <span className="font-bold text-foreground">{fa.mt5_server}</span></div>
                    <div>Password: <span className="font-bold text-foreground">{fa.mt5_password}</span></div>
                    {fa.investor_password && <div>Investor pw: <span className="font-bold text-foreground">{fa.investor_password}</span></div>}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fa.status === "pending" ? "Waiting for admin to deliver MT5 credentials." : `Status: ${fa.status}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payout request */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="font-display text-base font-bold">Request a Payout</div>
        <p className="mt-1 text-sm text-muted-foreground">Minimum ₦5,000 · processed within 24hrs of admin approval · one request per 7 days.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            type="text"
            inputMode="numeric"
            placeholder={`Up to ${formatNaira(Math.max(0, balance))}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1"
          />
          <Button onClick={requestPayout} disabled={submitting || balance < 5000} className="font-display">
            {submitting ? "Requesting..." : "Request Payout"}
          </Button>
        </div>
        {balance < 5000 && (
          <p className="mt-2 text-xs text-muted-foreground">You need at least {formatNaira(5000)} available balance to request a payout.</p>
        )}
      </div>

      {/* Recent commissions */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="font-display text-base font-bold">Recent Commissions</div>
        {commissions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No commissions yet. Share your link to start earning.</p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {commissions.slice(0, 10).map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                <span className="font-display font-semibold text-primary">{formatNaira(c.amount_naira)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payout history */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="font-display text-base font-bold">Payout History</div>
        {payouts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No payouts yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted-foreground">{new Date(p.requested_at).toLocaleDateString()}</span>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="capitalize">{p.status}</Badge>
                  <span className="font-display font-semibold">{formatNaira(p.amount_naira)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{className?:string}>; label: string; value: string; sub?: string; }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="font-display mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
