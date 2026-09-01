import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAdminData } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNaira, formatUSD } from "@/lib/utils";
import { Eye, Download } from "lucide-react";
import { CertificateCard, type Certificate } from "@/components/certificates/CertificateCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_admin/admin/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const {
    accounts, payouts, equityDraft, equitySaving, setEquityDraft, submitEquity,
    kycTarget, kycVerifying, kycRejectReason, kycRejecting, setKycTarget, setKycRejectReason, openKycVerify, submitKycVerify, submitKycReject,
    breachTarget, breachReason, breaching,
    breachType, setBreachType, breachPair, setBreachPair,
    breachOpenTime, setBreachOpenTime, breachCloseTime, setBreachCloseTime, breachDuration, setBreachDuration,
    setBreachTarget, setBreachReason, openBreachDialog, submitBreach,
    warnTarget, warnReason, warning,
    warnType, setWarnType, warnPair, setWarnPair,
    warnOpenTime, setWarnOpenTime, warnCloseTime, setWarnCloseTime, warnDuration, setWarnDuration,
    setWarnTarget, setWarnReason, openWarningDialog, submitWarning,
    rejectTarget, rejectReason, rejecting, rejectType, setRejectTarget, setRejectReason, setRejectType,
    openRejectDialog, submitRejectPhase, approvePhase2, approveFunded, viewCredsFor, setViewCredsFor, updateAccount,
    resetAccountBalance, advanceTier,
  } = useAdminData();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [credDraft, setCredDraft] = useState<Record<string, Record<string, string>>>({});
  const [credSaving, setCredSaving] = useState<string | null>(null);
  const [certTarget, setCertTarget] = useState<Certificate | null>(null);
  const [certLoading, setCertLoading] = useState<string | null>(null);
  const payoutAccountIds = useMemo(() => new Set(payouts.filter(p => p.trader_account_id).map(p => p.trader_account_id)), [payouts]);

  async function openFundedCertificate(account: any) {
    setCertLoading(account.id);
    try {
      const { data } = await supabase
        .from("certificates")
        .select("*")
        .eq("trader_account_id", account.id)
        .eq("kind", "funded")
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setCertTarget(data as Certificate);
      } else {
        setCertTarget({
          id: account.id,
          kind: "funded",
          certificate_number: `FNG-FND-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          full_name: account.profiles?.full_name ?? "Trader",
          account_size: account.starting_balance,
          challenge_name: account.challenges?.name ?? "Challenge",
          mt5_login: account.mt5_login ?? "",
          payout_amount: null,
          issued_at: new Date().toISOString(),
        });
      }
    } catch {
      setCertTarget({
        id: account.id,
        kind: "funded",
        certificate_number: `FNG-FND-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        full_name: account.profiles?.full_name ?? "Trader",
        account_size: account.starting_balance,
        challenge_name: account.challenges?.name ?? "Challenge",
        mt5_login: account.mt5_login ?? "",
        payout_amount: null,
        issued_at: new Date().toISOString(),
      });
    } finally {
      setCertLoading(null);
    }
  }

  const tabs = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "phase1", label: "Phase 1" },
    { id: "phase2", label: "Phase 2" },
    { id: "funded", label: "Funded" },
    { id: "archived", label: "Archived" },
    { id: "has_payout", label: "Has Payout" },
  ] as const;

  function getBreachReason(type: string, pair: string, openTime: string, closeTime: string, duration: string, name: string) {
    switch (type) {
      case "inactivity":
        return `Hi ${name}, your FundedNG challenge account has been closed due to inactivity. Our rules require at least 1 trade every calendar week to keep your account active. Unfortunately no trading activity was detected on your account within the required period.\nYou're welcome to start a new challenge anytime at fundedng.fun 💪\n— FundedNG Team`;
      case "drawdown":
        return `Hi ${name}, your FundedNG challenge account has been closed due to exceeding the maximum allowed drawdown.\nYou're welcome to start a new challenge anytime at fundedng.fun 💪\n— FundedNG Team`;
      case "scalping":
        return `Hi ${name}, your FundedNG challenge account has been closed due to a scalping violation.\nTrade Details:\nPair: ${pair || "—"}\nOpen: ${openTime || "—"}\nClose: ${closeTime || "—"}\nDuration: ${duration || "—"}\nOur rules require ALL trades to be held for a minimum of 3 minutes (180 seconds) regardless of how they are closed. You get 3 warnings, then the 4th short-held trade breaches your account. Two short trades at the same time is an instant breach.\nYou're welcome to start a new challenge anytime at fundedng.fun 💪\n— FundedNG Team`;
      default: return "";
    }
  }

  function getWarnReason(type: string, pair: string, openTime: string, closeTime: string, duration: string, name: string) {
    switch (type) {
      case "inactivity":
        return `Hi ${name}, your FundedNG challenge account is at risk of being closed due to inactivity. Our rules require at least 1 trade every calendar week to keep your account active. Please place a trade to keep your account active.\n— FundedNG Team`;
      case "drawdown":
        return `Hi ${name}, your FundedNG challenge account has received a warning for exceeding the maximum allowed drawdown. Please manage your risk carefully.\n— FundedNG Team`;
      case "scalping":
        return `Hi ${name}, your FundedNG challenge account has received a warning for scalping.\nTrade Details:\nPair: ${pair || "—"}\nOpen: ${openTime || "—"}\nClose: ${closeTime || "—"}\nDuration: ${duration || "—"}\nOur rules require ALL trades to be held for a minimum of 3 minutes (180 seconds) regardless of close type. You have a 3-warning grace allowance — the 4th short-held trade will breach your account. Two short trades at the same time is an instant breach.\n— FundedNG Team`;
      default: return "";
    }
  }

  const breachTypes = [
    { value: "inactivity", label: "Inactivity" },
    { value: "scalping", label: "Scalping" },
    { value: "drawdown", label: "Drawdown Exceeded" },
  ] as const;

  const warnTypes = [
    { value: "inactivity", label: "Inactivity" },
    { value: "scalping", label: "Scalping" },
    { value: "drawdown", label: "Drawdown Exceeded" },
  ] as const;

  return (
    <div className="mt-6 space-y-2">
      <h2 className="font-display text-xl font-bold">Trader Accounts</h2>
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${activeTab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <Input placeholder="Search by MT5 login or trader name…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 w-full max-w-md" />
      {accounts.filter((a) => {
        if (activeTab === "active") return a.status === "active";
        if (activeTab === "phase1") return a.current_phase === 1 && a.status === "active";
        if (activeTab === "phase2") return a.current_phase === 2 && a.status === "active";
        if (activeTab === "funded") return a.status === "funded";
        if (activeTab === "archived") return a.status === "breached";
        if (activeTab === "has_payout") return payoutAccountIds.has(a.id);
        return true;
      }).filter((a) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        return (a.mt5_login ?? "").toLowerCase().includes(q) || (a.profiles?.full_name ?? "").toLowerCase().includes(q);
      }).map((a) => {
        const fmt = a.currency === "USD" ? formatUSD : formatNaira;
        return (
        <div key={a.id}>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
              <div className="font-semibold">{a.profiles?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{a.challenges?.name} · login {a.mt5_login} {a.currency === "USD" && <Badge variant="outline" className="ml-1 border-blue-400/40 text-blue-500 text-[10px]">USD</Badge>}</div>
              </div>
              <div className="text-sm">{fmt(a.starting_balance)}</div>
              <div className="font-display text-sm text-gold">{a.current_phase >= 3 ? (a.funded_tier ? `Funded ${a.funded_tier}` : "Funded") : `Phase ${a.current_phase}`}</div>
              <Badge variant="outline" className="font-display">{a.status.toUpperCase()}</Badge>
              {a.reset_used && (
                <Badge variant="outline" className="border-violet-500/50 text-violet-500 text-[10px]">↺ Reset Used</Badge>
              )}
              {a.monitor_paused && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-500 text-[10px]">⏸ Monitor Paused</Badge>
              )}
            </div>
            {(() => {
              const eq = Number(a.current_equity ?? a.starting_balance);
              const st = Number(a.starting_balance);
              const pk = Number(a.peak_equity ?? a.starting_balance);
              const profitPct = st > 0 ? ((eq - st) / st) * 100 : 0;
              const ddPct = pk > 0 ? Math.max(0, ((pk - eq) / pk) * 100) : 0;
              const maxDD = Number(a.challenges?.max_drawdown_percent ?? 20);
              const ddColor = ddPct / maxDD > 0.75 ? "text-red-500" : ddPct / maxDD > 0.5 ? "text-amber-500" : "text-green-500";
              return (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Equity: <span className="font-display text-primary">{fmt(eq)}</span></span>
                  <span className="text-muted-foreground">P/L: <span className={`font-display ${profitPct >= 0 ? "text-green-500" : "text-red-500"}`}>{profitPct >= 0 ? "+" : ""}{profitPct.toFixed(2)}%</span></span>
                  <span className="text-muted-foreground">Drawdown: <span className={`font-display ${ddColor}`}>{ddPct.toFixed(2)}%</span><span className="text-muted-foreground/60"> / {maxDD}%</span></span>
                  <span className="text-muted-foreground">Peak: <span className="font-display">{fmt(pk)}</span></span>
                  <span className="text-muted-foreground">DD Limit: <span className="font-display text-red-500">{fmt(Math.floor(pk * (1 - maxDD / 100)))}</span></span>
                  <span className="text-muted-foreground">Days traded: <span className="font-display">{a.trading_days ?? 0}</span></span>
                  {a.last_synced_at && <span className="text-muted-foreground/60">Synced: {new Date(a.last_synced_at).toLocaleString()}</span>}
                </div>
              );
            })()}
            <div className="mt-2 flex flex-wrap gap-1">
              {(() => {
                if (a.current_phase >= 2 || a.status !== "active") return null;
                const target = Number(a.challenges?.profit_target_percent ?? 10);
                const equity = Number(a.current_equity ?? a.starting_balance);
                const required = Number(a.starting_balance) * (1 + target / 100);
                const hit = equity >= required;
                const requested = !!a.phase2_requested_at;
                return (<>{requested && (<><Badge variant="outline" className="font-display border-warning/40 text-warning">PHASE 2 REQUESTED</Badge><Button size="sm" variant="destructive" onClick={() => openRejectDialog(a, "phase2")}>Reject</Button></>)}{hit ? <><Button size="sm" onClick={() => approvePhase2(a)}>Phase 1 passed → Approve Phase 2</Button><span className="text-[10px] text-muted-foreground italic ml-1">⚡ Auto-provisions when criteria met. Use as fallback.</span></> : <span className="text-[11px] text-muted-foreground">Needs {fmt(Math.ceil(required))} equity ({target}% target)</span>}</>);
              })()}
              {a.current_phase >= 2 && a.status === "active" && (() => {
                const target = Number(a.challenges?.phase2_profit_target_percent ?? a.challenges?.profit_target_percent ?? 10);
                const equity = Number(a.current_equity ?? a.starting_balance);
                const required = Number(a.starting_balance) * (1 + target / 100);
                const hit = equity >= required;
                const requested = !!a.funded_requested_at;
                return (<>{requested && (<><Badge variant="outline" className="font-display border-warning/40 text-warning">FUNDED REQUESTED</Badge><Button size="sm" variant="destructive" onClick={() => openRejectDialog(a, "funded")}>Reject</Button></>)}{hit ? <><Button size="sm" onClick={() => approveFunded(a)}>Phase 2 passed → Approve Funded</Button><span className="text-[10px] text-muted-foreground italic ml-1">⚡ Auto-provisions when criteria met. Use as fallback.</span></> : <span className="text-[11px] text-muted-foreground">Needs {fmt(Math.ceil(required))} equity ({target}% target)</span>}</>);
              })()}
              <Button size="sm" variant="outline" onClick={() => openWarningDialog(a)}>Warning</Button>
              <Button size="sm" variant="outline" onClick={() => openBreachDialog(a)}>Breach</Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => { setViewCredsFor(a); setCredDraft((d) => ({ ...d, [a.id]: { mt5_login: a.mt5_login ?? "", mt5_server: a.mt5_server ?? "", mt5_password: a.mt5_password ?? "", investor_password: a.investor_password ?? "" } })); }}>
                <Eye className="mr-1 h-3.5 w-3.5" />Credentials
              </Button>
              {a.status === "funded" && payoutAccountIds.has(a.id) && (
                <Button size="sm" variant="outline" onClick={() => resetAccountBalance(a)}>Reset Balance</Button>
              )}
              {a.status === "funded" && (
                <Button size="sm" variant="outline" onClick={() => advanceTier(a)} title="Close current account and provision a fresh one at the next funded tier from the pool">
                  Advance Tier
                </Button>
              )}
              {a.status === "funded" && (
                <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1">
                  <span className="px-1 text-[10px] text-muted-foreground">Tier</span>
                  {[1, 2, 3, 4].map((t) => (
                    <button key={t} type="button" title={`Set to Funded ${t}`}
                      onClick={() => {
                        const current = Number(a.funded_tier ?? 1);
                        if (current === t) return;
                        if (!confirm(`Set ${a.profiles?.full_name ?? "trader"} (${a.mt5_login}) to ${t === 4 ? "Funded 4+" : `Funded ${t}`}? This sets their current withdrawal tier.`)) return;
                        updateAccount(a.id, { funded_tier: t });
                      }}
                      className={`rounded px-2 py-1 text-xs font-display ${
                        (Number(a.funded_tier ?? 1) === t && t < 4)
                          || (t === 4 && Number(a.funded_tier ?? 1) >= 4)
                          ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}>{t === 4 ? "4+" : t}</button>
                  ))}
                </div>
              )}
              {a.status === "funded" && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={certLoading === a.id} onClick={() => openFundedCertificate(a)}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-background p-3">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor={`eq-${a.id}`} className="text-[10px] uppercase tracking-wide text-muted-foreground">Update equity</Label>
              <Input id={`eq-${a.id}`} type="number" inputMode="decimal" placeholder={`Current: ${a.current_equity ?? a.starting_balance}`}
                value={equityDraft[a.id] ?? ""} onChange={(e) => setEquityDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") submitEquity(a); }} className="mt-1 h-9" />
            </div>
            <Button size="sm" onClick={() => submitEquity(a)}>Save</Button>
          </div>
          {a.profiles && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3">
              <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">KYC:</span>
      <Badge variant="outline" className={`font-display text-[10px] ${a.profiles.kyc_verified ? "border-green-500/50 text-green-500" : "border-amber-500/50 text-amber-500"}`}>{a.profiles?.kyc_verified ? "VERIFIED" : "PENDING"}</Badge>
      {!a.profiles?.kyc_verified && a.profiles?.bank_account_number && <Button size="sm" variant="outline" onClick={() => openKycVerify(a)}>Verify bank</Button>}
      {!a.profiles?.kyc_verified && a.profiles?.kyc_document_url && <Button size="sm" variant="outline" onClick={() => openKycVerify(a)}>Review document</Button>}
      {a.profiles?.kyc_document_url && !a.profiles?.kyc_verified && <Badge variant="outline" className="border-blue-500/50 text-blue-500 text-[10px]">DOCUMENT SUBMITTED</Badge>}
              </div>
            </div>
          )}
        </div>
      ); })}

      {/* Edit credentials dialog */}
      <Dialog open={!!viewCredsFor} onOpenChange={(o) => { if (!o) { setViewCredsFor(null); setCredDraft({}); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>MT5 Credentials</DialogTitle>
            <DialogDescription>Edit the MT5 login, server, and passwords below.</DialogDescription>
          </DialogHeader>
          {viewCredsFor && (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Login</Label>
                <Input value={credDraft[viewCredsFor.id]?.mt5_login ?? ""} onChange={(e) => setCredDraft((d) => ({ ...d, [viewCredsFor.id]: { ...d[viewCredsFor.id], mt5_login: e.target.value } }))} className="h-9 font-mono text-sm" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Server</Label>
                <Input value={credDraft[viewCredsFor.id]?.mt5_server ?? ""} onChange={(e) => setCredDraft((d) => ({ ...d, [viewCredsFor.id]: { ...d[viewCredsFor.id], mt5_server: e.target.value } }))} className="h-9 font-mono text-sm" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Master Password</Label>
                <Input value={credDraft[viewCredsFor.id]?.mt5_password ?? ""} onChange={(e) => setCredDraft((d) => ({ ...d, [viewCredsFor.id]: { ...d[viewCredsFor.id], mt5_password: e.target.value } }))} className="h-9 font-mono text-sm" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Investor Password</Label>
                <Input value={credDraft[viewCredsFor.id]?.investor_password ?? ""} onChange={(e) => setCredDraft((d) => ({ ...d, [viewCredsFor.id]: { ...d[viewCredsFor.id], investor_password: e.target.value } }))} className="h-9 font-mono text-sm" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setViewCredsFor(null); setCredDraft({}); }}>Cancel</Button>
            <Button onClick={async () => {
              if (!viewCredsFor) return;
              const draft = credDraft[viewCredsFor.id];
              if (!draft) return;
              setCredSaving(viewCredsFor.id);
              await updateAccount(viewCredsFor.id, { mt5_login: draft.mt5_login, mt5_server: draft.mt5_server, mt5_password: draft.mt5_password, investor_password: draft.investor_password || null });
              setCredSaving(null);
              setViewCredsFor(null);
              setCredDraft({});
            }} disabled={credSaving === viewCredsFor?.id}>{credSaving === viewCredsFor?.id ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KYC dialog */}
      <Dialog open={!!kycTarget} onOpenChange={(o) => { if (!o && !kycVerifying && !kycRejecting) { setKycTarget(null); setKycRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify trader KYC</DialogTitle>
            <DialogDescription>Review the trader's KYC information below.</DialogDescription>
          </DialogHeader>
          {kycTarget && (
            <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Trader</div><div className="font-display font-semibold">{kycTarget.profiles?.full_name ?? "—"}</div></div>
              {kycTarget.profiles?.kyc_document_url ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">KYC Document</div>
                  <div className="mt-1">
                    {kycTarget.profiles.kyc_document_type && <div className="text-xs text-muted-foreground mb-1">Type: {kycTarget.profiles.kyc_document_type}</div>}
                    {kycTarget.profiles.kyc_document_url.match(/\.(png|jpe?g|webp)$/i) ? (
                      <img src={kycTarget.profiles.kyc_document_url} alt="KYC document" className="max-h-64 rounded border border-border object-contain" />
                    ) : (
                      <a href={kycTarget.profiles.kyc_document_url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 text-xs">View document (PDF)</a>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Account number</div><div className="font-mono text-base text-primary">{kycTarget.profiles?.bank_account_number ?? "—"}</div></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Bank</div><div>{kycTarget.profiles?.bank_name ?? "—"}</div></div>
                    <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Account name</div><div>{kycTarget.profiles?.bank_account_name ?? "—"}</div></div>
                  </div>
                </>
              )}
              <div className="text-xs text-muted-foreground">MT5 login: <span className="font-mono">{kycTarget.mt5_login}</span></div>
              {kycTarget.profiles?.kyc_document_url && (
                <div className="mt-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Rejection reason</div>
                  <Textarea placeholder="Reason for rejection (required to reject)" value={kycRejectReason} onChange={(e) => setKycRejectReason(e.target.value)} rows={2} />
                </div>
              )}
            </div>
          )}
          <DialogFooter className={kycTarget?.profiles?.kyc_document_url ? "justify-between" : ""}>
            {kycTarget?.profiles?.kyc_document_url ? (
              <>
                <Button variant="destructive" onClick={submitKycReject} disabled={kycRejecting || !kycRejectReason.trim()}>{kycRejecting ? "Rejecting…" : "Reject"}</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setKycTarget(null); setKycRejectReason(""); }} disabled={kycVerifying || kycRejecting}>Cancel</Button>
                  <Button onClick={submitKycVerify} disabled={kycVerifying}>{kycVerifying ? "Verifying…" : "Verify KYC"}</Button>
                </div>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setKycTarget(null)} disabled={kycVerifying}>Cancel</Button>
                <Button onClick={submitKycVerify} disabled={kycVerifying}>{kycVerifying ? "Verifying…" : "Verify KYC"}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Breach dialog */}
      <Dialog open={!!breachTarget} onOpenChange={(o) => !breaching && !o && setBreachTarget(null)}>
        <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Breach Account</DialogTitle>
            <DialogDescription>Breaching account for {breachTarget?.profiles?.full_name ?? "trader"} ({breachTarget?.mt5_login}).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Breach type</Label>
              <div className="flex flex-wrap gap-2">
                {breachTypes.map((t) => (
                  <Button key={t.value} size="sm" variant={breachType === t.value ? "default" : "outline"}
                    onClick={() => {
                      setBreachType(t.value);
                      setBreachPair(""); setBreachOpenTime(""); setBreachCloseTime(""); setBreachDuration("");
                      setBreachReason(getBreachReason(t.value, "", "", "", "", breachTarget?.profiles?.full_name ?? "Trader"));
                    }}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
            {breachType === "scalping" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Trading Pair</Label>
                  <Input placeholder="e.g. EURUSDm" value={breachPair}
                    onChange={(e) => { setBreachPair(e.target.value); setBreachReason(getBreachReason(breachType, e.target.value, breachOpenTime, breachCloseTime, breachDuration, breachTarget?.profiles?.full_name ?? "Trader")); }} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Open Time</Label>
                  <Input placeholder="e.g. 2026-06-08 23:41:00" value={breachOpenTime}
                    onChange={(e) => { setBreachOpenTime(e.target.value); setBreachReason(getBreachReason(breachType, breachPair, e.target.value, breachCloseTime, breachDuration, breachTarget?.profiles?.full_name ?? "Trader")); }} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Close Time</Label>
                  <Input placeholder="e.g. 2026-06-08 23:41:32" value={breachCloseTime}
                    onChange={(e) => { setBreachCloseTime(e.target.value); setBreachReason(getBreachReason(breachType, breachPair, breachOpenTime, e.target.value, breachDuration, breachTarget?.profiles?.full_name ?? "Trader")); }} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Duration</Label>
                  <Input placeholder="e.g. 32 seconds" value={breachDuration}
                    onChange={(e) => { setBreachDuration(e.target.value); setBreachReason(getBreachReason(breachType, breachPair, breachOpenTime, breachCloseTime, e.target.value, breachTarget?.profiles?.full_name ?? "Trader")); }} />
                </div>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="breach-reason">Reason for breach</Label>
              <Textarea id="breach-reason" placeholder="Enter the reason for breaching this account..." value={breachReason} onChange={(e) => setBreachReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBreachTarget(null); setBreachReason(""); }} disabled={breaching}>Cancel</Button>
            <Button variant="destructive" onClick={submitBreach} disabled={breaching || !breachReason.trim()}>{breaching ? "Breaching…" : "Breach Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning dialog */}
      <Dialog open={!!warnTarget} onOpenChange={(o) => !warning && !o && setWarnTarget(null)}>
        <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Send Warning</DialogTitle>
            <DialogDescription>Send a warning to {warnTarget?.profiles?.full_name ?? "trader"} ({warnTarget?.mt5_login}).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Warning type</Label>
              <div className="flex flex-wrap gap-2">
                {warnTypes.map((t) => (
                  <Button key={t.value} size="sm" variant={warnType === t.value ? "default" : "outline"}
                    onClick={() => {
                      setWarnType(t.value);
                      setWarnPair(""); setWarnOpenTime(""); setWarnCloseTime(""); setWarnDuration("");
                      setWarnReason(getWarnReason(t.value, "", "", "", "", warnTarget?.profiles?.full_name ?? "Trader"));
                    }}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
            {warnType === "scalping" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Trading Pair</Label>
                  <Input placeholder="e.g. EURUSDm" value={warnPair}
                    onChange={(e) => { setWarnPair(e.target.value); setWarnReason(getWarnReason(warnType, e.target.value, warnOpenTime, warnCloseTime, warnDuration, warnTarget?.profiles?.full_name ?? "Trader")); }} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Open Time</Label>
                  <Input placeholder="e.g. 2026-06-08 23:41:00" value={warnOpenTime}
                    onChange={(e) => { setWarnOpenTime(e.target.value); setWarnReason(getWarnReason(warnType, warnPair, e.target.value, warnCloseTime, warnDuration, warnTarget?.profiles?.full_name ?? "Trader")); }} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Close Time</Label>
                  <Input placeholder="e.g. 2026-06-08 23:41:32" value={warnCloseTime}
                    onChange={(e) => { setWarnCloseTime(e.target.value); setWarnReason(getWarnReason(warnType, warnPair, warnOpenTime, e.target.value, warnDuration, warnTarget?.profiles?.full_name ?? "Trader")); }} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Duration</Label>
                  <Input placeholder="e.g. 32 seconds" value={warnDuration}
                    onChange={(e) => { setWarnDuration(e.target.value); setWarnReason(getWarnReason(warnType, warnPair, warnOpenTime, warnCloseTime, e.target.value, warnTarget?.profiles?.full_name ?? "Trader")); }} />
                </div>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="warn-reason">Warning message</Label>
              <Textarea id="warn-reason" placeholder="Describe the concerning trading activity..." value={warnReason} onChange={(e) => setWarnReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWarnTarget(null); setWarnReason(""); }} disabled={warning}>Cancel</Button>
            <Button variant="default" onClick={submitWarning} disabled={warning || !warnReason.trim()}>{warning ? "Sending…" : "Send Warning"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !rejecting && !o && setRejectTarget(null)}>
        <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {rejectType === "phase2" ? "Phase 2" : "Funded"} Request</DialogTitle>
            <DialogDescription>Rejecting request for {rejectTarget?.profiles?.full_name ?? "trader"} ({rejectTarget?.mt5_login}).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="reject-reason">Reason for rejection</Label>
              <Textarea id="reject-reason" placeholder="Enter the reason for rejecting this request..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); setRejectType(null); }} disabled={rejecting}>Cancel</Button>
            <Button variant="destructive" onClick={submitRejectPhase} disabled={rejecting || !rejectReason.trim()}>{rejecting ? "Rejecting…" : "Reject Request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Funded Certificate dialog */}
      <Dialog open={!!certTarget} onOpenChange={(o) => { if (!o) setCertTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Funded Certificate</DialogTitle>
            <DialogDescription>Preview and download the same certificate traders see.</DialogDescription>
          </DialogHeader>
          {certTarget && <CertificateCard cert={certTarget} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
