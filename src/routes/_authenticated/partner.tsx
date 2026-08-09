import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { formatNaira } from "@/lib/utils";
import { toast } from "sonner";
import { Copy, Gift, MousePointerClick, Users, Wallet, Send, Share2, Percent, Mail, Landmark, ShieldCheck, ShieldAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshButton } from "@/components/ui/refresh-button";
import { getBuyerInfo } from "@/server/partner.functions";
import { listNigerianBanks, verifyKycPaystack } from "@/server/kyc.functions";

export const Route = createFileRoute("/_authenticated/partner")({
  component: PartnerPage,
});

interface PartnerProfile {
  promo_code: string;
  commission_rate: number;
  total_earned_naira: number;
  total_paid_naira: number;
  is_active: boolean;
  free_account_challenge_id: string | null;
}
interface Referral { id: string; referred_user_id: string; commission_amount_naira: number; amount_paid_naira: number; order_id: string | null; created_at: string; }
interface Payout { id: string; amount_naira: number; status: string; requested_at: string; admin_note: string | null; }
interface FreeAccount { id: string; status: string; account_size: number; challenge_name: string; mt5_login: string | null; mt5_password: string | null; investor_password: string | null; mt5_server: string | null; requested_at: string; }

function PartnerPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [pp, setPp] = useState<PartnerProfile | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [freeAccounts, setFreeAccounts] = useState<FreeAccount[]>([]);
  const [freeChallenge, setFreeChallenge] = useState<any | null>(null);
  const [clicks, setClicks] = useState(0);
  const [signups, setSignups] = useState(0);
  const [buyerEmails, setBuyerEmails] = useState<Record<string, string>>({});
  const [buyerNames, setBuyerNames] = useState<Record<string, string>>({});
  const [pendingReserved, setPendingReserved] = useState(0);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [banks, setBanks] = useState<Array<{ name: string; code: string; slug: string }>>([]);
  const [kycVerified, setKycVerified] = useState(!!profile?.kyc_verified);
  const [kycDocUploading, setKycDocUploading] = useState(false);
  const [kycDocFile, setKycDocFile] = useState<File | null>(null);
  const [bankAccountNumber, setBankAccountNumber] = useState(profile?.bank_account_number ?? "");
  const [bankName, setBankName] = useState(profile?.bank_name ?? "");
  const [bankAccountName, setBankAccountName] = useState(profile?.bank_account_name ?? "");
  const [bankCode, setBankCode] = useState("");
  const [verifyingKyc, setVerifyingKyc] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const [profRes, refRes, payRes, clickRes, signupRes, freeRes] = await Promise.all([
      supabase.from("partner_profiles").select("promo_code,commission_rate,total_earned_naira,total_paid_naira,is_active,free_account_challenge_id").eq("user_id", user.id).maybeSingle(),
      supabase.from("partner_referrals").select("*").eq("partner_id", user.id).order("created_at", { ascending: false }),
      supabase.from("partner_payouts").select("*").eq("partner_id", user.id).order("requested_at", { ascending: false }),
      supabase.from("partner_clicks").select("*", { count: "exact", head: true }).eq("partner_id", user.id),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("partner_referred_by", user.id),
      (supabase as any).from("partner_free_accounts").select("*, challenges(name, account_size, currency)").eq("partner_id", user.id).order("requested_at", { ascending: false }),
    ]);
    const refList = (refRes.data as Referral[]) ?? [];
    const partnerData = (profRes.data as PartnerProfile | null) ?? null;
    setPp(partnerData);
    setReferrals(refList);
    const list = (payRes.data as Payout[]) ?? [];
    setPayouts(list);
    setPendingReserved(list.filter((x) => ["pending","approved"].includes(x.status)).reduce((s,x)=>s+Number(x.amount_naira),0));
    setFreeAccounts((freeRes.data as FreeAccount[]) ?? []);
    setClicks(clickRes.count ?? 0);
    setSignups(signupRes.count ?? 0);
    if (partnerData?.free_account_challenge_id) {
      const { data: ch } = await supabase.from("challenges").select("id, name, account_size, currency").eq("id", partnerData.free_account_challenge_id).maybeSingle();
      setFreeChallenge(ch ?? null);
    } else {
      setFreeChallenge(null);
    }

    const { data: sess } = await supabase.auth.getSession();
    if (sess.session && refList.length > 0) {
      const uids = [...new Set(refList.map((r) => r.referred_user_id))];
      const res = await getBuyerInfo({ accessToken: sess.session.access_token, userIds: uids });
      if (res.ok) {
        setBuyerEmails(res.emails);
        setBuyerNames(res.names);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    listNigerianBanks().then((res) => {
      if (res.ok && Array.isArray(res.banks)) setBanks(res.banks);
    });
  /* eslint-disable-next-line */ }, [user]);

  const verifyBankWithPaystack = async () => {
    const acct = bankAccountNumber.replace(/\s+/g, "");
    if (!/^\d{10}$/.test(acct)) return toast.error("Account number must be 10 digits.");
    if (!bankCode) return toast.error("Select your bank.");
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return toast.error("Please sign in again.");
    const bank = banks.find((b) => b.code === bankCode);
    setVerifyingKyc(true);
    try {
      const res = await verifyKycPaystack({
        data: {
          accessToken: sess.session.access_token,
          accountNumber: acct,
          bankCode,
          bankName: bank?.name ?? bankName.trim() ?? "",
        },
      });
      if (!res.ok) return toast.error(res.error);
      setKycVerified(true);
      setBankAccountNumber(acct);
      setBankName(bank?.name ?? bankName.trim() ?? "");
      setBankAccountName(res.accountName ?? "");
      toast.success(`Verified · ${res.accountName}`);
      await refresh();
    } finally {
      setVerifyingKyc(false);
    }
  };

  if (!loading && !pp) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6">
        <h1 className="font-display text-2xl font-bold">Partner Program</h1>
        <p className="mt-3 text-sm text-muted-foreground">You don't have a partner profile yet. Reach out to admin to be onboarded.</p>
        <Button className="mt-6" onClick={() => navigate({ to: "/dashboard" })}>Back to Dashboard</Button>
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const refLink = pp ? `${origin}/?ref=${pp.promo_code}` : "";

  const copy = async (text: string, label = "Copied!") => {
    try { await navigator.clipboard.writeText(text); toast.success(label); }
    catch { toast.error("Copy failed"); }
  };
  const share = async () => {
    if (!refLink) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Join FundedNG", text: "Get funded to trade", url: refLink }); return; }
      catch { /* fallthrough */ }
    }
    copy(refLink, "Partner link copied!");
  };

  // 7-day cooldown
  const lastRequest = payouts.find((p) => ["pending","approved","paid"].includes(p.status));
  const cooldownEnds = lastRequest ? new Date(lastRequest.requested_at).getTime() + 7*24*60*60*1000 : 0;
  const cooldownActive = cooldownEnds > Date.now();
  const daysLeft = cooldownActive ? Math.ceil((cooldownEnds - Date.now()) / (24*60*60*1000)) : 0;

  const balance = pp ? pp.total_earned_naira - pp.total_paid_naira - pendingReserved : 0;
  const purchases = referrals.length;

  const uploadKycDocument = async () => {
    if (!kycDocFile) return toast.error("Select a file first");
    if (kycDocFile.size > 5 * 1024 * 1024) return toast.error("File must be under 5MB");
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return toast.error("Please sign in again.");
    setKycDocUploading(true);
    try {
      const ext = kycDocFile.name.split(".").pop() ?? "jpg";
      const path = `${sess.session.user.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("kyc-documents").upload(path, kycDocFile, { contentType: kycDocFile.type });
      if (uploadErr) { toast.error(uploadErr.message); return; }
      const { data: urlData } = await supabase.storage.from("kyc-documents").createSignedUrl(path, 604800);
      if (!urlData?.signedUrl) { toast.error("Failed to get document URL"); return; }
      const docType = kycDocFile.type.startsWith("image/") ? "Image" : "PDF";
      const { error: updErr } = await supabase.from("profiles").update({ kyc_document_url: urlData.signedUrl, kyc_document_type: docType }).eq("id", sess.session.user.id);
      if (updErr) { toast.error(updErr.message); return; }
      toast.success("KYC document uploaded. Admin will review it.");
      setKycDocFile(null);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setKycDocUploading(false); }
  };

  const claimFreeAccount = async () => {
    if (freeAccounts.length > 0) return toast.error("You've already requested your free partnership account.");
    setClaiming(true);
    const { error } = await supabase.rpc("claim_partner_free_account" as any);
    setClaiming(false);
    if (error) return toast.error(error.message);
    toast.success("Free partnership account requested. Admin will deliver your MT5 credentials.");
    load();
  };

  const requestPayout = async () => {
    const amt = Number(amount.replace(/[^0-9]/g, ""));
    if (!amt || amt < 5000) return toast.error("Minimum payout is ₦5,000");
    if (amt > balance) return toast.error("Amount exceeds available balance");
    if (!kycVerified) return toast.error("Verify your bank account above first.");
    setSubmitting(true);
    const { error } = await supabase.rpc("request_partner_payout", { _amount: amt });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Payout requested.");
    setAmount("");
    load();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Partner Dashboard</h1>
          <p className="text-sm text-muted-foreground">Earn {pp?.commission_rate ?? 20}% on every sale through your link.</p>
        </div>
        <RefreshButton onRefresh={async () => { await load(); toast.success("Updated"); }} />
      </div>

      {/* Promo link */}
      <div className="rounded-2xl border border-primary/40 bg-card p-6">
        <div className="font-display text-sm font-semibold text-primary">YOUR PARTNER LINK</div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={refLink} className="flex-1 font-mono text-xs" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => copy(refLink, "Link copied!")}><Copy className="mr-1 h-4 w-4"/>Copy</Button>
            <Button onClick={share}><Share2 className="mr-1 h-4 w-4"/>Share</Button>
          </div>
        </div>
        {pp && (
          <p className="mt-3 text-xs text-muted-foreground">
            Promo code: <span className="font-mono font-bold text-foreground">{pp.promo_code}</span>
            {" · "}Buyer discount: <span className="font-bold text-foreground">15%</span>
            {" · "}Commission rate: <span className="font-bold text-foreground">{pp.commission_rate}%</span>
          </p>
        )}
      </div>

      {/* One-time free partnership account */}
      {(freeChallenge || freeAccounts.length > 0) && (
        <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-display text-base font-bold">🎁 Free {freeChallenge?.name ?? "Partnership"} Account</div>
              <p className="mt-1 text-sm text-muted-foreground">After 5 referral purchases, you unlock a free {freeChallenge ? <>{freeChallenge.name} ({(freeChallenge.currency === "USD" ? "$" : "₦")}{Number(freeChallenge.account_size).toLocaleString()})</> : "partnership"} challenge account. You have <span className="font-semibold text-foreground">{purchases}/5</span> purchases.</p>
            </div>
            {freeAccounts.length === 0 ? (
              purchases >= 5 ? (
                <Button onClick={claimFreeAccount} disabled={claiming} className="font-display">
                  <Gift className="mr-1 h-4 w-4" />{claiming ? "Requesting..." : "Request Account"}
                </Button>
              ) : (
                <div className="text-right">
                  <Button disabled className="font-display opacity-50">
                    <Gift className="mr-1 h-4 w-4" />Request Account
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">{5 - purchases} more purchase(s) needed</p>
                </div>
              )
            ) : (
              <Badge variant="outline" className="capitalize">{freeAccounts[0].status}</Badge>
            )}
          </div>
          {freeAccounts.length > 0 && (
            <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
              {freeAccounts[0].status === "fulfilled" && freeAccounts[0].mt5_login ? (
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {freeAccounts[0].challenges?.name ?? freeAccounts[0].challenge_name ?? "Challenge"} ({(freeAccounts[0].challenges?.currency === "USD" ? "$" : "₦")}{Number(freeAccounts[0].challenges?.account_size ?? freeAccounts[0].account_size).toLocaleString()})
                  </div>
                  <div className="grid gap-1 font-mono text-xs">
                    <div>Login: <span className="font-bold text-foreground">{freeAccounts[0].mt5_login}</span></div>
                    <div>Server: <span className="font-bold text-foreground">{freeAccounts[0].mt5_server}</span></div>
                    <div>Password: <span className="font-bold text-foreground">{freeAccounts[0].mt5_password}</span></div>
                    {freeAccounts[0].investor_password && <div>Investor pw: <span className="font-bold text-foreground">{freeAccounts[0].investor_password}</span></div>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Your request for a free {freeAccounts[0]?.challenges?.name ?? freeAccounts[0]?.challenge_name ?? "partnership"} account is with admin. MT5 credentials will appear here after delivery.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* KYC — Bank Account Verification */}
      <div className={`mt-6 rounded-2xl border p-6 ${kycVerified ? "border-primary/30 bg-primary/5" : "border-warning/40 bg-warning/5"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display flex items-center gap-2 text-base font-semibold">
              {kycVerified ? <ShieldCheck className="h-4 w-4 text-primary"/> : <ShieldAlert className="h-4 w-4 text-warning"/>}
              Payout Bank Account
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Verify your bank account via Paystack to receive payouts. The account name must match your profile name.
            </p>
          </div>
          <Badge className={`font-display ${kycVerified ? "bg-primary/15 text-primary border-primary/30" : "bg-warning/15 text-warning border-warning/30"}`}>
            {kycVerified ? "VERIFIED" : "PENDING"}
          </Badge>
        </div>
        {kycVerified ? (
          <div className="mt-5 rounded-md border border-border bg-background p-3 text-sm">
            <div className="text-[11px] text-muted-foreground">Verified bank account</div>
            <div className="font-display mt-1 text-primary break-words">
              {bankAccountNumber} · {bankName} · {bankAccountName}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Need to change it? Re-verify with new details — KYC will reset until the new account passes.
            </p>
          </div>
        ) : null}
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="partner-bank-acct">Account number</Label>
            <Input id="partner-bank-acct" inputMode="numeric" maxLength={10} placeholder="10-digit NUBAN" className="mt-1 font-mono" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label htmlFor="partner-bank-select">Bank</Label>
            <Select value={bankCode} onValueChange={(v) => { setBankCode(v); setBankName(banks.find((b) => b.code === v)?.name ?? ""); }}>
              <SelectTrigger id="partner-bank-select" className="mt-1">
                <SelectValue placeholder={banks.length ? "Select your bank" : "Loading banks…"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {banks.map((b) => (
                  <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          We'll fetch the registered account name from your bank and approve KYC instantly if it matches your profile name (<span className="font-display text-foreground">{profile?.full_name || "—"}</span>).
        </p>
        <Button size="sm" className="mt-4 font-display" onClick={verifyBankWithPaystack} disabled={verifyingKyc || !bankCode || bankAccountNumber.length !== 10}>
          <Landmark className="mr-1 h-4 w-4" />{verifyingKyc ? "Verifying…" : kycVerified ? "Re-verify bank" : "Verify bank account"}
        </Button>
      </div>

      {/* KYC document upload (alternative to bank verification) */}
      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="font-display text-sm font-semibold">KYC Document Upload</div>
        <p className="mt-1 text-xs text-muted-foreground">For USD accounts or as an alternative to bank verification, upload a valid government-issued ID or passport. Max 5MB (PNG, JPG, PDF).</p>
        {profile?.kyc_document_url && !kycVerified ? (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <span className="font-semibold text-amber-500">Document submitted — </span>
            <span className="text-muted-foreground">awaiting admin review. Check back later.</span>
          </div>
        ) : null}
        {!kycVerified && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf" onChange={(e) => setKycDocFile(e.target.files?.[0] ?? null)} className="file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary" />
            </div>
            <Button size="sm" variant="outline" onClick={uploadKycDocument} disabled={kycDocUploading || !kycDocFile}>
              {kycDocUploading ? "Uploading…" : "Upload document"}
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={MousePointerClick} label="Clicks" value={clicks.toString()} />
        <Stat icon={Users} label="Signups" value={signups.toString()} sub={`${purchases} purchases`} />
        <Stat icon={Percent} label="Total earned" value={formatNaira(pp?.total_earned_naira ?? 0)} sub={`Paid: ${formatNaira(pp?.total_paid_naira ?? 0)}`} />
        <Stat icon={Wallet} label="Available" value={formatNaira(Math.max(0, balance))} sub="Min ₦5,000" />
      </div>

      {/* Payout request */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="font-display text-base font-bold">Request a Payout</div>
        <p className="mt-1 text-sm text-muted-foreground">Minimum ₦5,000 · one request per 7 days · processed within 24hrs of admin approval.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            type="text"
            inputMode="numeric"
            placeholder={`Up to ${formatNaira(Math.max(0, balance))}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1"
            disabled={cooldownActive}
          />
          <Button onClick={requestPayout} disabled={submitting || balance < 5000 || cooldownActive || !kycVerified} className="font-display">
            <Send className="mr-1 h-4 w-4" />
            {submitting ? "Requesting..." : "Request Payout"}
          </Button>
        </div>
        {cooldownActive && (
          <p className="mt-2 text-xs text-amber-500">You can request your next payout in {daysLeft} day{daysLeft===1?"":"s"}.</p>
        )}
        {!cooldownActive && balance < 5000 && (
          <p className="mt-2 text-xs text-muted-foreground">You need at least {formatNaira(5000)} available balance to request a payout.</p>
        )}
        {!kycVerified ? (
          <p className="mt-2 text-xs text-amber-500">Verify your bank account above to enable payouts.</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-green-500">Bank account verified. You can now request payouts.</p>
            {bankAccountNumber && (
              <div className="mt-2 rounded-md border border-border bg-background p-2 text-xs">
                <span className="text-muted-foreground">Payout destination: </span>
                <span className="font-display text-foreground">{bankAccountNumber} · {bankName} · {bankAccountName}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recent referrals */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="font-display text-base font-bold">Recent Purchases</div>
        {referrals.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No purchases yet. Share your link to start earning.</p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {referrals.slice(0, 15).map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                    <Mail className="h-3 w-3" />
                    {buyerEmails[r.referred_user_id] ?? "—"}
                    {buyerNames[r.referred_user_id] && <span className="text-muted-foreground/50">· {buyerNames[r.referred_user_id]}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">Sale: {formatNaira(r.amount_paid_naira)}</span>
                  <span className="font-display font-semibold text-primary">+{formatNaira(r.commission_amount_naira)}</span>
                </div>
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