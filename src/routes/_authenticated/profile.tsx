import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listNigerianBanks, verifyKycPaystack } from "@/server/kyc.functions";
import { listResettableAccountsServer } from "@/server/admin.functions";
import { formatNaira, formatUSD } from "@/lib/utils";
import { LayoutDashboard, ShieldCheck, ShoppingBag, LogOut, BarChart3, LifeBuoy, ShieldAlert, Landmark, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const { profile, user, isAdmin, signOut, refresh } = useAuth();
  const navigate = useNavigate();

  const [bankAccountNumber, setBankAccountNumber] = useState(profile?.bank_account_number ?? "");
  const [bankName, setBankName] = useState(profile?.bank_name ?? "");
  const [bankAccountName, setBankAccountName] = useState(profile?.bank_account_name ?? "");
  const [bankCode, setBankCode] = useState("");
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [kycVerified, setKycVerified] = useState(!!profile?.kyc_verified);
  const [verifyingKyc, setVerifyingKyc] = useState(false);
  const [kycDocUploading, setKycDocUploading] = useState(false);
  const [kycDocFile, setKycDocFile] = useState<File | null>(null);

  useEffect(() => {
    setBankAccountNumber(profile?.bank_account_number ?? "");
    setBankName(profile?.bank_name ?? "");
    setBankAccountName(profile?.bank_account_name ?? "");
    setKycVerified(!!profile?.kyc_verified);
  }, [profile]);

  useEffect(() => {
    listNigerianBanks().then((res) => {
      if (res.ok && Array.isArray(res.banks)) setBanks(res.banks);
    });
  }, []);

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
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setKycDocUploading(false);
    }
  };

  // --- Reset a breached account ---
  type ResetRow = {
    id: string; mt5Login: string | null; challengeId: string | null; label: string;
    challengeName: string | null; currency: string; isUsd: boolean;
    startingBalance: number; currentPhase: number; fundedTier: number | undefined;
    feeInCurrency: number | null; eligible: boolean; reason: string | null;
  };
  const [resettable, setResettable] = useState<{ accounts: ResetRow[]; campaignActive: boolean; campaignEndAt: string | null } | null>(null);
  const [loadingResettable, setLoadingResettable] = useState(true);
  const [resetCountdown, setResetCountdown] = useState("--:--:--");
  const [confirmingAccountId, setConfirmingAccountId] = useState<string | null>(null);

  const loadResettable = useCallback(async () => {
    try {
      setLoadingResettable(true);
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;
      const res = await listResettableAccountsServer({ data: { accessToken: sess.session.access_token } });
      if (!res.ok) return;
      setResettable({
        accounts: (res as any).accounts ?? [],
        campaignActive: !!(res as any).campaignActive,
        campaignEndAt: (res as any).campaignEndAt ?? null,
      });
    } finally {
      setLoadingResettable(false);
    }
  }, []);

  useEffect(() => { loadResettable(); }, [loadResettable]);

  useEffect(() => {
    if (!resettable?.campaignEndAt) return;
    const tick = () => {
      const diff = Math.max(0, new Date(resettable.campaignEndAt!).getTime() - Date.now());
      if (diff <= 0) { setResetCountdown("ended"); return; }
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setResetCountdown(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resettable?.campaignEndAt]);

  const confirmReset = async (row: ResetRow) => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { toast.error("Please sign in again"); return; }
    setConfirmingAccountId(row.id);
    try {
      const res = await fetch("/api/initialize-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session.access_token}` },
        body: JSON.stringify({ challenge_id: row.challengeId, reset_account_id: row.id, currency: row.isUsd ? "USD" : "NGN" }),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean; authorization_url?: string; error?: string };
      if (!res.ok || !result.ok) return toast.error(result.error ?? "Could not start payment");
      if (!result.authorization_url) return toast.error("Could not start payment");
      window.location.href = result.authorization_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start payment");
    } finally {
      setConfirmingAccountId(null);
    }
  };

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate font-display text-xl">
              {profile?.full_name || "Trader"}
            </CardTitle>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {isAdmin && <Badge variant="default" className="text-[10px]">Admin</Badge>}
              {kycVerified ? (
                <Badge className="bg-success text-primary-foreground text-[10px]">KYC verified</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">KYC pending</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Link to="/dashboard">
            <Button variant="outline" className="w-full justify-start">
              <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
            </Button>
          </Link>
          <Link to="/stats">
            <Button variant="outline" className="w-full justify-start">
              <BarChart3 className="mr-2 h-4 w-4" /> Stats
            </Button>
          </Link>
          <Link to="/support" className="md:hidden">
            <Button variant="outline" className="w-full justify-start">
              <LifeBuoy className="mr-2 h-4 w-4" /> Support
            </Button>
          </Link>
          <Link to="/buy">
            <Button variant="outline" className="w-full justify-start">
              <ShoppingBag className="mr-2 h-4 w-4" /> Buy a challenge
            </Button>
          </Link>
          {isAdmin && (
            <Link to="/admin">
              <Button variant="outline" className="w-full justify-start">
                <ShieldCheck className="mr-2 h-4 w-4" /> Admin console
              </Button>
            </Link>
          )}
          <Button
            variant="destructive"
            className="mt-2 w-full justify-start"
            onClick={async () => {
              await signOut();
              navigate({ to: "/" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>

      {/* Reset a breached account */}
        {(!loadingResettable && resettable?.accounts && resettable.accounts.length > 0) && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start gap-2">
              <RefreshCcw className="mt-0.5 h-4 w-4 text-primary" />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-semibold">Reset a breached account</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {resettable?.campaignActive
                    ? "Special reset window open — the normal one-reset-per-account and creation-date restrictions are suspended for all accounts while this window is active."
                    : "Each account can be reset once. Funded 2 accounts are excluded."}
                </p>
              </div>
            </div>

            {resettable?.campaignActive && resetCountdown !== "ended" && (
              <div className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-4">
                <p className="text-xs font-medium text-warning">
                  ⏳ Special reset window ends in <span className="font-mono font-bold text-foreground">{resetCountdown}</span> — the one-reset-per-account limit is lifted for everyone during this window (Funded 2 accounts remain excluded).
                </p>
              </div>
            )}
            {resettable?.campaignActive && resetCountdown === "ended" && (
              <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                The special reset window has ended — standard reset rules apply again.
              </div>
            )}

            <div className="mt-4 space-y-3">
              {resettable!.accounts.map((row) => (
                <div key={row.id} className={`rounded-xl border ${row.eligible ? "border-border bg-background" : "border-border/50 bg-muted/10 opacity-70"} p-4`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-semibold">{row.label}</span>
                        {row.mt5Login && <span className="font-mono text-xs text-muted-foreground">MT5 {row.mt5Login}</span>}
                        {row.challengeName && <Badge variant="secondary" className="hidden h-5 text-[10px] sm:inline-flex">{row.challengeName}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                        <span>Size: {row.isUsd ? formatUSD(row.startingBalance) : formatNaira(row.startingBalance)}</span>
                        {row.eligible && row.feeInCurrency !== null && (
                          <span>Reset fee: <span className="font-semibold text-primary">{row.isUsd ? formatUSD(row.feeInCurrency) : formatNaira(row.feeInCurrency)}</span></span>
                        )}
                      </div>
                      {!row.eligible && row.reason && (
                        <p className="mt-2 rounded-md bg-destructive/5 px-2 py-1 text-[11px] text-destructive">{row.reason}</p>
                      )}
                    </div>
                    {row.eligible && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={confirmingAccountId === row.id}
                        onClick={() => confirmReset(row)}
                        className="shrink-0 self-start"
                      >
                        <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                        {confirmingAccountId === row.id ? "Starting payment…" : "Pay & Reset"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KYC — Bank Account Verification */}
      <div className={`mt-6 rounded-2xl border p-6 ${kycVerified ? "border-primary/30 bg-primary/5" : "border-warning/40 bg-warning/5"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display flex items-center gap-2 text-base font-semibold">
              {kycVerified ? <ShieldCheck className="h-4 w-4 text-primary"/> : <ShieldAlert className="h-4 w-4 text-warning"/>}
              KYC Verification
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
            <Label htmlFor="profile-bank-acct">Account number</Label>
            <Input id="profile-bank-acct" inputMode="numeric" maxLength={10} placeholder="10-digit NUBAN" className="mt-1 font-mono" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label htmlFor="profile-bank-select">Bank</Label>
            <Select value={bankCode} onValueChange={(v) => { setBankCode(v); setBankName(banks.find((b) => b.code === v)?.name ?? ""); }}>
              <SelectTrigger id="profile-bank-select" className="mt-1">
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
    </div>
  );
}