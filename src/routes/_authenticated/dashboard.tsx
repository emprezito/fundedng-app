import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatNaira, formatPercent, formatUSD, calculateBusinessDays, addBusinessDays } from "@/lib/utils";
import { toast } from "sonner";
import { LogOut, Plus, Trophy, TrendingUp, Activity, Bell, ShieldCheck, ShieldAlert, Landmark, Sparkles, Check, Clock, XCircle, AlertTriangle } from "lucide-react";
import { CertificateCard, type Certificate } from "@/components/certificates/CertificateCard";
import { subscribeToPush } from "@/lib/push";
import { NewUserInstallPrompt } from "@/components/NewUserInstallPrompt";
import { PendingAccounts } from "@/components/dashboard/PendingAccounts";
import { TradingAnalytics } from "@/components/dashboard/TradingAnalytics";
import { LeaderboardActivityBanner } from "@/components/dashboard/LeaderboardActivityBanner";
import { RefreshButton } from "@/components/ui/refresh-button";
import { listNigerianBanks, verifyKycPaystack } from "@/server/kyc.functions";
import { requestPayoutServer, sendPhaseRequestNotificationServer } from "@/server/admin.functions";
import { notifyEmail } from "@/lib/notify-email";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

interface Account {
  id: string; mt5_login: string; mt5_password: string; mt5_server: string;
  starting_balance: number; current_equity: number | null; current_phase: number;
  peak_equity?: number | null;
  scalping_warnings?: number;
  status: "active" | "breached" | "passed" | "funded";
  breach_reason?: string;
  challenge_id: string;
  created_at: string;
  phase1_passed_at: string | null;
  phase2_passed_at: string | null;
  funded_at: string | null;
  phase2_requested_at: string | null;
  funded_requested_at: string | null;
  phase_rejected_reason?: string | null;
  phase_rejected_at?: string | null;

  trading_days?: number;
  currency?: string;
  last_payout_date?: string | null;
  challenges?: { name: string; profit_target_percent: number; phase2_profit_target_percent?: number | null; max_drawdown_percent: number; phases: number; min_trading_days?: number; max_daily_drawdown_percent?: number | null; drawdown_type?: string };
}

interface PartnerFreeAccount {
  id: string;
  status: string;
  account_size: number;
  challenge_name: string;
  mt5_login: string | null;
  mt5_password: string | null;
  mt5_server: string | null;
  requested_at: string;
  fulfilled_at: string | null;
}
interface Payout { id: string; amount_naira: number; status: string; payment_method: string; created_at: string; trader_account_id?: string; }
interface Notification { id: string; title: string; message: string; type: string; is_read: boolean; created_at: string; }

function PayoutCountdown({ nextPayoutDate, businessDays = 7, isUsd }: { nextPayoutDate: Date; businessDays?: number; isUsd?: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = nextPayoutDate.getTime() - Date.now();
  const isReady = diff <= 0;
  const days = Math.max(0, Math.floor(diff / 86400000));
  const hours = Math.max(0, Math.floor((diff % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((diff % 3600000) / 60000));
  const seconds = Math.max(0, Math.floor((diff % 60000) / 1000));
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-6">
      <div className="font-display flex items-center gap-2 text-base font-bold text-primary">
        <Clock className="h-4 w-4" />
        {isReady ? "🎉 Payout Window Open!" : "⏳ Next Payout Window"}
      </div>
      {isReady ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Your payout window is open. Request your payout now — processed within 24hrs of approval.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: "Days", value: days },
            { label: "Hours", value: hours },
            { label: "Mins", value: minutes },
            { label: "Secs", value: seconds },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-background p-2 text-center sm:p-3">
              <div className="font-display text-xl font-bold text-primary sm:text-2xl">
                {String(value).padStart(2, "0")}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-[11px] text-muted-foreground">
        Payout rules: {isUsd ? "10 business days" : "7 calendar days"} between requests · 80/20 split · {isUsd ? "first 2 payouts capped at 6%, subsequent at 10%" : "first payout capped at 10%, subsequent at 50%"} · processed within 24hrs of approval
      </p>
    </div>
  );
}

const statusVariant: Record<string, string> = {
  active: "bg-primary/15 text-primary border-primary/30",
  breached: "bg-destructive/15 text-destructive border-destructive/30",
  passed: "bg-gold/15 text-gold border-gold/30",
  funded: "bg-info/15 text-info border-info/30",
};

function DashboardPage() {
  const { user, profile, signOut, refresh } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [partnerFreeAccount, setPartnerFreeAccount] = useState<PartnerFreeAccount | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [snapshots, setSnapshots] = useState<{ snapshot_time: string; equity: number; balance: number }[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<"phase1" | "phase2" | "funded">("phase1");
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [kycVerified, setKycVerified] = useState(!!profile?.kyc_verified);
  const [verifyingKyc, setVerifyingKyc] = useState(false);
  const [kycDocUploading, setKycDocUploading] = useState(false);
  const [kycDocFile, setKycDocFile] = useState<File | null>(null);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'disconnected'>('connecting');
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedReasons, setBlockedReasons] = useState<{ reason: string; current: string; required: string }[]>([]);
  const [blockedType, setBlockedType] = useState<"phase2" | "funded">("phase2");
  const lastEquityRef = useRef<number | null>(null);
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

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

  const phaseSnapshots = useMemo(() => {
    const active = phaseInfo.find(p => p.key === selectedPhase);
    if (!active || !snapshots.length) return snapshots;
    return snapshots.filter(s => {
      const t = s.snapshot_time;
      return t >= active.start && (!active.end || t < active.end);
    });
  }, [snapshots, phaseInfo, selectedPhase]);

  useEffect(() => {
    setBankAccountNumber(profile?.bank_account_number ?? "");
    setBankName(profile?.bank_name ?? "");
    setBankAccountName(profile?.bank_account_name ?? "");
  }, [profile]);

  useEffect(() => {
    listNigerianBanks().then((res) => {
      if (res.ok && Array.isArray(res.banks)) setBanks(res.banks);
    });
  }, []);

  // Fire the welcome email once per new signup, the first time the user lands
  // on the dashboard after registering (covers email-confirm flows where the
  // signup screen has no session yet).
  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem("fng-new-user") === "1") {
        notifyEmail({ type: "welcome", userId: user.id });
        localStorage.removeItem("fng-new-user");
      }
    } catch { /* ignore */ }
  }, [user]);

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
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setKycDocUploading(false); }
  };

  const load = async (): Promise<Account[]> => {
    if (!user) return [];
    const [a, p, n, c, pf] = await Promise.all([
      supabase.from("trader_accounts").select("*, challenges(name,profit_target_percent,phase2_profit_target_percent,max_drawdown_percent,phases,min_trading_days,max_daily_drawdown_percent,drawdown_type)").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("payouts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("certificates").select("*").eq("user_id", user.id).order("issued_at", { ascending: false }),
      (supabase as any).from("partner_free_accounts").select("*").eq("partner_id", user.id).maybeSingle(),
    ]);
    const list = (a.data as Account[]) ?? [];
    setAccounts(list);
    setPayouts((p.data as Payout[]) ?? []);
    setNotifications((n.data as Notification[]) ?? []);
    setCertificates((c.data as Certificate[]) ?? []);

    // If partner has a fulfilled free account, add it to accounts list
    const pfa = pf.data as PartnerFreeAccount | null;
    setPartnerFreeAccount(pfa);
    if (pfa && pfa.status === "fulfilled" && pfa.mt5_login) {
      // Check if we already added it
      if (!list.find((acc) => acc.mt5_login === pfa.mt5_login)) {
        // Find the corresponding trader_accounts row (created during delivery)
        const { data: taData } = await supabase
          .from("trader_accounts")
          .select("*, challenges(name,profit_target_percent,phase2_profit_target_percent,max_drawdown_percent,phases,drawdown_type)")
          .eq("mt5_login", pfa.mt5_login)
          .eq("user_id", user.id)
          .maybeSingle();

        if (taData) {
          // Use the real trader_accounts record
          if (!list.find((acc) => acc.id === taData.id)) {
            list.push(taData as Account);
            setAccounts([...list]);
          }
        } else {
          // Fallback: use challenge_id from partner_free_accounts if available
          const challengeId = pfa.challenge_id;
          let chData = null;
          if (challengeId) {
            const { data } = await supabase
              .from("challenges")
              .select("name, profit_target_percent, phase2_profit_target_percent, max_drawdown_percent, phases, min_trading_days, max_daily_drawdown_percent, drawdown_type")
              .eq("id", challengeId)
              .maybeSingle();
            chData = data;
          }
          const freeAccount: Account = {
            id: pfa.id,
            mt5_login: pfa.mt5_login!,
            mt5_password: pfa.mt5_password!,
            mt5_server: pfa.mt5_server!,
            starting_balance: 1000000,
            current_equity: 1000000,
            current_phase: 1,
            status: "active",
            challenge_id: challengeId || "",
            phase2_requested_at: null,
            funded_requested_at: null,
            challenges:             chData ?? { name: "Elite", profit_target_percent: 10, max_drawdown_percent: 20, phases: 2, min_trading_days: 3, drawdown_type: "trailing_equity" },
          };
          list.push(freeAccount);
          setAccounts([...list]);
        }
      }
    }

    if (!selected && list.length) setSelected(list[0]);
    return list;
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);
  const refreshDashboard = async () => {
    const list = await load();
    const fresh = list?.find((a) => a.id === selected?.id) ?? selected;
    if (fresh) {
      supabase
        .from("account_snapshots")
        .select("snapshot_time, equity, balance")
        .eq("trader_account_id", fresh.id)
        .order("snapshot_time", { ascending: false }).limit(2000).then(({ data }) => setSnapshots((data as { snapshot_time: string; equity: number; balance: number }[])?.reverse() ?? []));
      if (fresh.id !== selected?.id) setSelected(fresh);
    }
    toast.success("Dashboard updated");
  };
  useEffect(() => {
    if (!selected) return;
    supabase
      .from("account_snapshots")
      .select("snapshot_time, equity, balance")
      .eq("trader_account_id", selected.id)
      .order("snapshot_time", { ascending: false }).limit(2000).then(({ data }) => setSnapshots((data as { snapshot_time: string; equity: number; balance: number }[])?.reverse() ?? []));
    const last = phaseInfo[phaseInfo.length - 1];
    if (last) setSelectedPhase(last.key);
  }, [selected]);

  useEffect(() => {
    if (!user) return;

    setLiveStatus('connecting');

    const channel = supabase
      .channel(`user-live-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'account_snapshots',
        },
        (payload) => {
          if (
            payload.new.trader_account_id !==
            selectedRef.current?.id
          ) return;

          const newEquity = Number(payload.new.equity);
          if (
            lastEquityRef.current !== null &&
            lastEquityRef.current !== newEquity
          ) {
            toast('📊 Equity updated', { duration: 2000 });
          }
          lastEquityRef.current = newEquity;
          setSnapshots((prev) => [
            ...prev,
            {
              snapshot_time: payload.new.snapshot_time,
              equity: payload.new.equity,
              balance: payload.new.balance,
            },
          ]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trader_accounts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setSelected((prev) =>
            prev ? { ...prev, ...payload.new } : prev,
          );
          setAccounts((prev) =>
            prev.map((a) =>
              a.id === payload.new.id
                ? { ...a, ...payload.new }
                : a,
            ),
          );
          if (
            payload.new.status === 'breached' &&
            payload.old?.status !== 'breached'
          ) {
            toast.error(
              `⚠️ Account Breached — ${payload.new.breach_reason}`,
            );
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setLiveStatus('live');
        } else if (
          status === 'CLOSED' ||
          status === 'CHANNEL_ERROR'
        ) {
          setLiveStatus('disconnected');
          if (err) {
            console.error(
              '[realtime] subscription error:',
              err,
            );
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      lastEquityRef.current = null;
      setLiveStatus('disconnected');
    };
  }, [user?.id]);

  const requestPayout = async () => {
    if (!selected) return;
    if (!bankAccountNumber) return toast.error("Add your bank account in the KYC card first.");
    if (!kycVerified) return toast.error("Bank account pending admin verification.");
    if (selected.status !== "funded") return toast.error("Account must be funded.");
    const equity = Number(selected.current_equity ?? selected.starting_balance);
    const profit = equity - selected.starting_balance;
    const isUsdAccount = selected.currency === "USD";

    const priorPayouts = payouts.filter(
      (p) =>
        ["approved", "paid"].includes(p.status) &&
        (p as Payout & { trader_account_id?: string }).trader_account_id === selected.id,
    );
    const priorCount = priorPayouts.length;

    if (isUsdAccount && priorCount >= 5) return toast.error("Maximum 5 payouts reached for this account.");

    if (isUsdAccount) {
      const daysTraded = selected.trading_days ?? 0;
      if (daysTraded < 5) {
        return toast.error(
          `You need at least 5 profitable trading days (≥0.5% profit each) ` +
          `to request a payout. You have ${daysTraded} so far. ` +
          `Check your Trading Stats page for your daily breakdown.`
        );
      }
    }

    let minProfit: number;
    let profitCap: number;
    if (isUsdAccount) {
      if (priorCount < 2) {
        minProfit = selected.starting_balance * 0.06;
        profitCap = selected.starting_balance * 0.06;
      } else if (priorCount < 4) {
        minProfit = selected.starting_balance * 0.1;
        profitCap = selected.starting_balance * 0.1;
      } else {
        minProfit = 0;
        profitCap = profit * 0.5;
      }
    } else {
      const firstNgnCap = selected.starting_balance * 0.1;
      const subsequentNgnCap = selected.starting_balance * 0.5;
      minProfit = selected.starting_balance * 0.1;
      profitCap = priorCount === 0 ? firstNgnCap : subsequentNgnCap;
    }
    if (profit < minProfit) return toast.error(`You need at least ${formatNaira(minProfit)} in profit to request a payout.`);

    const requestedProfit = Math.min(profit, profitCap);
    const amount = Math.floor(requestedProfit * 0.8);

    if (priorCount === 0) {
      const capText = isUsdAccount
        ? `Payments 1-2 capped at 6% each, 3-4 capped at 10% each, final payout is 50% of remaining profit.`
        : `First payout capped at ${formatNaira(minProfit)} profit (you receive 80% = ${formatNaira(amount)}). Subsequent payouts use 50% cap.`;
      toast.message(capText);
    }
    setSubmitting(true);
    let exchangeRate = 1550;
    if (isUsdAccount) {
      const { data: rateData } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "usd_exchange_rate")
        .single();
      exchangeRate = Number(rateData?.value ?? 1550);
    }
    const amountInNaira = isUsdAccount
      ? Math.floor(requestedProfit * 0.8 * exchangeRate)
      : Math.floor(requestedProfit * 0.8);
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) {
      setSubmitting(false);
      return toast.error("Please sign in again");
    }
    const res = await requestPayoutServer({ data: {
      accessToken: sess.session.access_token,
      userId: user!.id,
      traderAccountId: selected.id,
      amountNaira: amountInNaira,
      profitPercent: Number(((requestedProfit / selected.starting_balance) * 100).toFixed(4)),
      bankDetails: {
        account_number: bankAccountNumber,
        bank_name: bankName,
        account_name: bankAccountName,
      },
    }});
    setSubmitting(false);
     if (!res.ok) return toast.error(res.error ?? "Request failed");
     toast.success(
       isUsdAccount
         ? `Payout of $${(requestedProfit * 0.8).toFixed(2)} requested!`
         : `Payout of ${formatNaira(amountInNaira)} requested!`
     );
     load();
  };

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const equity = Number(selected?.current_equity ?? latestSnapshot?.equity ?? selected?.starting_balance ?? 0);
  const start = Number(selected?.starting_balance ?? 0);
  const profitPct = start ? ((equity - start) / start) * 100 : 0;
  const peakEquity = (() => {
    const dbPeak = Number(selected?.peak_equity ?? 0);
    return dbPeak > 0 ? dbPeak : start;
  })();
  const maxDD = selected?.challenges?.max_drawdown_percent ?? 20;
  const maxDailyDD = selected?.challenges?.max_daily_drawdown_percent ?? null;
  const drawdownType = selected?.challenges?.drawdown_type ?? "trailing_equity";
  const isStaticBalance = drawdownType === "static_balance";
  const balance = Number(latestSnapshot?.balance ?? selected?.current_equity ?? selected?.starting_balance ?? 0);
  const ddPct = isStaticBalance
    ? (start > 0 ? Math.max(0, ((start - balance) / start) * 100) : 0)
    : (peakEquity > 0 ? Math.max(0, ((peakEquity - equity) / peakEquity) * 100) : 0);
  const target = selected?.current_phase === 2
    ? (selected?.challenges?.phase2_profit_target_percent ?? selected?.challenges?.profit_target_percent ?? 10)
    : (selected?.challenges?.profit_target_percent ?? 10);
  const dailyDrawdownPercent = (() => {
    if (!maxDailyDD) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const todaySnaps = snapshots.filter((s) => s.snapshot_time.slice(0, 10) === today);
    if (todaySnaps.length === 0) return 0;
    const dailyPeak = Math.max(...todaySnaps.map((s) => Number(isStaticBalance ? s.balance : s.equity)), isStaticBalance ? balance : equity);
    return dailyPeak > 0 ? ((dailyPeak - (isStaticBalance ? balance : equity)) / dailyPeak) * 100 : 0;
  })();
  const phaseEquity = phaseSnapshots.length > 0 ? Number(phaseSnapshots[phaseSnapshots.length - 1].equity) : equity;
  const phasePeak = phaseSnapshots.length > 0 ? Math.max(...phaseSnapshots.map(s => Number(s.equity))) : peakEquity;
  const unread = notifications.filter((n) => !n.is_read).length;

  const [ddCountdown, setDdCountdown] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const msUtc1 = now.getTime() + now.getTimezoneOffset() * 60000 + 3600000;
      const next = new Date(msUtc1);
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      const diff = next.getTime() - msUtc1;
      if (diff <= 0) { setDdCountdown("00:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDdCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const drawdownLimit = isStaticBalance ? start * (1 - maxDD / 100) : peakEquity * (1 - maxDD / 100);
  const profitTarget = selected?.status === "funded"
    ? start * (1 + 0.5)
    : start * (1 + target / 100);
  const currentBalance = equity;

  const minDays = selected?.currency === "USD" ? 5 : (selected?.challenges?.min_trading_days ?? 3);

  const canRequestPhase2 =
    !!selected &&
    selected.status === "active" &&
    selected.current_phase < 2 &&
    profitPct >= target;
  const phase2Requested = !!selected?.phase2_requested_at;

  const canRequestFunded =
    !!selected &&
    selected.status === "active" &&
    selected.current_phase >= 2 &&
    profitPct >= target;
  const fundedRequested = !!selected?.funded_requested_at;

  const getBlockedReasons = (type: "phase2" | "funded") => {
    const reasons: { reason: string; current: string; required: string }[] = [];
    const daysTraded = selected?.trading_days ?? 0;
    if (daysTraded < minDays) {
      reasons.push({ reason: "Minimum trading days not reached", current: `Current trading days: ${daysTraded}/${minDays}`, required: `${minDays} trading days` });
    }
    if (ddPct >= maxDD) {
      reasons.push({ reason: "Drawdown limit exceeded", current: `Current drawdown: ${ddPct.toFixed(2)}%/${maxDD}%`, required: `Drawdown below ${maxDD}%` });
    }
    if (maxDailyDD && dailyDrawdownPercent >= maxDailyDD) {
      reasons.push({ reason: "Daily drawdown limit exceeded", current: `Current daily drawdown: ${dailyDrawdownPercent.toFixed(2)}%/${maxDailyDD}%`, required: `Daily drawdown below ${maxDailyDD}%` });
    }
    return reasons;
  };

  const requestPhase2 = async () => {
    if (!selected) return;
    const reasons = getBlockedReasons("phase2");
    if (reasons.length > 0) {
      setBlockedReasons(reasons);
      setBlockedType("phase2");
      setBlockedOpen(true);
      return;
    }
    const { error } = await supabase.rpc("request_phase2", { _account_id: selected.id });
    if (error) return toast.error(error.message);
    await supabase.from("trader_accounts").update({ phase_rejected_reason: null, phase_rejected_at: null } as never).eq("id", selected.id);

    const { data: sess } = await supabase.auth.getSession();
    if (sess.session?.access_token) {
      await sendPhaseRequestNotificationServer({
        data: {
          accessToken: sess.session.access_token,
          accountId: selected.id,
          phase: "phase2",
        },
      }).catch(() => {});
    }

    toast.success("Phase 2 approval requested. An admin will review shortly.");
    load();
  };

  const requestFunded = async () => {
    if (!selected) return;
    const reasons = getBlockedReasons("funded");
    if (reasons.length > 0) {
      setBlockedReasons(reasons);
      setBlockedType("funded");
      setBlockedOpen(true);
      return;
    }
    const { error } = await supabase.rpc("request_funded", { _account_id: selected.id });
    if (error) return toast.error(error.message);
    await supabase.from("trader_accounts").update({ phase_rejected_reason: null, phase_rejected_at: null } as never).eq("id", selected.id);

    const { data: sess } = await supabase.auth.getSession();
    if (sess.session?.access_token) {
      await sendPhaseRequestNotificationServer({
        data: {
          accessToken: sess.session.access_token,
          accountId: selected.id,
          phase: "funded",
        },
      }).catch(() => {});
    }

    toast.success("Funded approval requested. An admin will review shortly.");
    load();
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome back, {profile?.full_name || user?.email}</p>
          </div>
          <div className="flex gap-2">
            <RefreshButton onRefresh={refreshDashboard} />
            {typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted" && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const ok = await subscribeToPush(user!.id, supabase);
                  if (ok) toast.success("Notifications enabled");
                  else toast.error("Could not enable notifications");
                }}
              >
                <Bell className="mr-1 h-4 w-4" />Enable Push
              </Button>
            )}
            <Link to="/buy"><Button size="sm" className="font-display"><Plus className="mr-1 h-4 w-4"/>New Challenge</Button></Link>
            <Button size="sm" variant="outline" onClick={signOut}><LogOut className="mr-1 h-4 w-4"/>Sign out</Button>
          </div>
        </div>

        {user && <PendingAccounts userId={user.id} />}

        <div className="mt-4">
          <LeaderboardActivityBanner />
        </div>

        {accounts.length === 0 ? (
          <div className="mt-10 overflow-hidden rounded-2xl border border-primary/40 bg-card p-8 md:p-12">
            <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-display tracking-wider text-primary">
                  <Sparkles className="h-3 w-3" /> GET STARTED
                </div>
                <h2 className="font-display mt-4 text-3xl font-bold leading-tight md:text-4xl">
                  You don't have an active challenge yet
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Pick an account size, pass two simple phases, and get funded up to ₦2,000,000 — with payouts processed within 24hrs of approval.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                  {[
                    "Instant FundedNG MT5 evaluation account",
                    "Just 3 trading rules — 3-minute minimum hold time, 20% trailing drawdown, 3 min trading days (profits spread across them)",
                    "80% profit split, paid in Naira",
                    "Full equity & drawdown tracking on this dashboard",
                  ].map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex flex-wrap gap-2">
                  <Link to="/buy">
                    <Button size="lg" className="font-display animate-pulse-glow">
                      Get Your First Account →
                    </Button>
                  </Link>
                  <Link to="/rules">
                    <Button size="lg" variant="outline" className="font-display">
                      Read the rules
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="relative hidden rounded-xl border border-border bg-background/60 p-6 md:block">
                <Trophy className="mx-auto h-16 w-16 text-primary" />
                <p className="font-display mt-4 text-center text-lg font-semibold">From ₦7,500</p>
                <p className="mt-1 text-center text-xs text-muted-foreground">One-time challenge fee</p>
              </div>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="mt-8">
            <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              <TabsList className="w-max min-w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
                <TabsTrigger value="payouts">Payouts</TabsTrigger>
                <TabsTrigger value="certificates">
                  <Trophy className="mr-1 h-3 w-3"/>Certificates {certificates.length > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{certificates.length}</span>}
                </TabsTrigger>
                <TabsTrigger value="notifications">
                  <Bell className="mr-1 h-3 w-3"/>Notifications {unread > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unread}</span>}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-6 space-y-6">
              {accounts.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {accounts.map((a) => (
                    <button key={a.id} onClick={() => setSelected(a)}
                      className={`font-display rounded-md border px-3 py-1.5 text-xs ${selected?.id === a.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                      {a.mt5_login} · {a.challenges?.name}
                    </button>
                  ))}
                </div>
              )}

              {selected && (() => {
                const fmt = selected.currency === "USD" ? formatUSD : formatNaira;
                return (
                <>
                  {selected.status === "breached" && selected.breach_reason && (
                    <Alert variant="destructive">
                      <ShieldAlert className="h-4 w-4" />
                      <AlertDescription>
                        <span className="font-display font-semibold">Account Breached</span>
                        <p className="mt-1 text-sm">{selected.breach_reason}</p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {notifications.filter((n) => n.type === "warning" && !n.is_read).map((w) => (
                    <Alert key={w.id} variant="default" className="border-warning/50 bg-warning/5">
                      <ShieldAlert className="h-4 w-4 text-warning" />
                      <AlertDescription>
                        <span className="font-display font-semibold text-warning">⚠️ Trading Warning</span>
                        <p className="mt-1 text-sm">{w.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</p>
                        <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={async () => {
                          await supabase.from("notifications").update({ is_read: true } as never).eq("id", w.id);
                          setNotifications((prev) => prev.filter((x) => x.id !== w.id));
                        }}>Noted</Button>
                      </AlertDescription>
                    </Alert>
                  ))}

                  {selected.phase_rejected_reason && selected.status !== "breached" && (
                    <Alert variant="destructive">
                      <ShieldAlert className="h-4 w-4" />
                      <AlertDescription>
                        <span className="font-display font-semibold">
                          {selected.current_phase < 2 ? "Phase 2" : "Funded"} Request Rejected
                        </span>
                        <p className="mt-1 text-sm">{selected.phase_rejected_reason}</p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {(() => {
                    return (
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                        {[
                          { label: "Account Size", value: fmt(start) },
                          { label: "Equity", value: fmt(equity), color: "text-primary" },
                          { label: "P/L", value: fmt(equity - start), color: equity-start >= 0 ? "text-primary" : "text-destructive" },
                          { label: "Drawdown Limit", value: fmt(Math.floor(peakEquity * (1 - maxDD / 100))), color: "text-red-500" },
                          ...(maxDailyDD ? [{ label: "Daily DD Limit", value: `${maxDailyDD}%`, color: "text-red-500" }] : []),
                           { label: "Phase", value: selected.status === "funded" ? "FUNDED" : `${selected.current_phase}/${selected.challenges?.phases ?? 2}`, color: "text-gold" },
                          { label: "Status", value: <Badge className={`${statusVariant[selected.status]} font-display`}>{selected.status.toUpperCase()}</Badge> },
                        ].map((m, i) => (
                          <div key={i} className="rounded-xl border border-border bg-card p-5">
                            <div className="text-xs text-muted-foreground">{m.label}</div>
                            <div className={`font-display mt-2 text-lg font-bold ${m.color ?? ""}`}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="rounded-xl border border-border bg-card p-6">
                     <h3 className="font-display flex items-center gap-2 text-base font-semibold"><TrendingUp className="h-4 w-4 text-primary"/>{selected.status === "funded" ? "Funded Progress" : `Phase ${selected.current_phase} Progress`}</h3>
                     <div className="mt-5 space-y-5">
                       <div>
                         <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Profit Target</span><span className="font-display text-primary">{formatPercent(Math.max(0, profitPct))} / {target}%</span></div>
                         <Progress value={Math.min(100, Math.max(0, (profitPct / target) * 100))} />
                       </div>
                       <div>
                           <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{isStaticBalance ? "Static Drawdown" : "Drawdown"}</span><span className={`font-display ${ddPct/maxDD>0.75?"text-destructive":ddPct/maxDD>0.5?"text-warning":"text-primary"}`}>{formatPercent(ddPct)} / {maxDD}%</span></div>
                          <Progress value={Math.min(100, (ddPct/maxDD)*100)} />
                       </div>
                       {maxDailyDD ? (
                       <div>
                           <div className="mb-1 flex justify-between text-xs">
                             <div className="flex items-center gap-2">
                               <span className="text-muted-foreground">Daily Drawdown</span>
                               <span className="font-mono text-[10px] text-muted-foreground/60">↻ resets in {ddCountdown}</span>
                             </div>
                             <span className={`font-display ${dailyDrawdownPercent/maxDailyDD>0.75?"text-destructive":dailyDrawdownPercent/maxDailyDD>0.5?"text-warning":"text-primary"}`}>{formatPercent(dailyDrawdownPercent)} / {maxDailyDD}%</span>
                           </div>
                          <Progress value={Math.min(100, (dailyDrawdownPercent/maxDailyDD)*100)} />
                       </div>
                       ) : null}
                       {(() => {
                         const isUSD = selected.currency === "USD";
                         if (!isUSD) return null;
                         const daysTraded = selected.trading_days ?? 0;
                         const minProfitableDays = 5;
                         const profitableDayThreshold = 0.005;
                         return (
                           <div className="mt-4 space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
                             <div className="font-display text-sm font-semibold text-primary">USD Compliance Checklist</div>
                             <div className="space-y-1.5 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className={dailyDrawdownPercent <= 5 ? "text-green-500" : "text-red-500"}>{dailyDrawdownPercent <= 5 ? "✅" : "❌"}</span>
                                  <span className="text-muted-foreground">Daily Drawdown ≤ 5% — Current: {formatPercent(dailyDrawdownPercent)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={ddPct <= 10 ? "text-green-500" : "text-red-500"}>{ddPct <= 10 ? "✅" : "❌"}</span>
                                  <span className="text-muted-foreground">{isStaticBalance ? "Static Drawdown" : "Total Drawdown"} ≤ 10% — Current: {formatPercent(ddPct)}</span>
                                </div>
                               <div className="flex items-center gap-2">
                                 <span className={daysTraded >= minProfitableDays ? "text-green-500" : "text-red-500"}>{daysTraded >= minProfitableDays ? "✅" : "❌"}</span>
                                 <span className="text-muted-foreground">Profitable Days: {daysTraded} of {minProfitableDays} required (≥0.5% profit each)</span>
                               </div>
                               <div className="flex items-center gap-2">
                                 <span className="text-amber-500">⚠️</span>
                                 <span className="text-muted-foreground">News Trading: profits within 5 mins of red-folder events are voided</span>
                               </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-amber-500">⚠️</span>
                                  <span className="text-muted-foreground">No weekend holding · No news trading within 5 min</span>
                                </div>
                             </div>
                           </div>
                         );
                       })()}
                     </div>
                     {selected.status !== "funded" && selected.current_phase < 2 && selected.status === "active" && (
                      <div className="mt-5 rounded-md border border-primary/30 bg-primary/5 p-4">
                        {phase2Requested ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-warning" />
                            <span className="font-display">Phase 2 approval requested — awaiting admin review.</span>
                          </div>
                        ) : canRequestPhase2 ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm">
                              <div className="font-display font-semibold text-primary">🎯 You hit the {target}% target!</div>
                              <p className="text-xs text-muted-foreground">Request phase 2 approval — an admin will review and progress your account.</p>
                            </div>
                            <Button size="sm" onClick={requestPhase2}>Request Phase 2 Approval</Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Reach {target}% profit ({fmt(Math.ceil(start * (1 + target / 100)))} equity) to request phase 2 approval.
                          </p>
                        )}
                      </div>
                    )}
                     {selected.status !== "funded" && selected.current_phase >= 2 && selected.status === "active" && (
                      <div className="mt-5 rounded-md border border-gold/30 bg-gold/5 p-4">
                        {fundedRequested ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-warning" />
                            <span className="font-display">Funded approval requested — awaiting admin review.</span>
                          </div>
                        ) : canRequestFunded ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm">
                              <div className="font-display font-semibold text-gold">🏆 You hit the {target}% target!</div>
                              <p className="text-xs text-muted-foreground">Request funded approval — an admin will review and fund your account.</p>
                            </div>
                            <Button size="sm" onClick={requestFunded}>Request Funded Approval</Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Reach {target}% profit ({fmt(Math.ceil(start * (1 + target / 100)))} equity) to request funded approval.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {snapshots.length > 1 ? (
                    <div className="rounded-xl border border-border bg-card p-6">
                      <h3 className="font-display flex items-center gap-2 text-base font-semibold"><Activity className="h-4 w-4 text-primary"/>Equity Curve{liveStatus === 'live' ? (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-xs font-display text-green-500">Live</span>
            </span>
          ) : liveStatus === 'connecting' ? (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground" />
              </span>
              <span className="text-xs font-display text-muted-foreground">Connecting...</span>
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-xs font-display text-red-500">Reconnecting...</span>
            </span>
          )}</h3>
                      <div className="mt-4 h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={snapshots}>
                            <XAxis dataKey="snapshot_time" hide />
                            <YAxis
                              tick={{ fontSize: 11, fill: "currentColor" }}
                              stroke="currentColor"
                              className="text-muted-foreground"
                              domain={["auto", "auto"]}
                              tickFormatter={(v) => fmt(v)}
                            />
                            <Tooltip
                              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                              formatter={(v: number, name: string) => [fmt(v), name === "equity" ? "Equity" : name === "balance" ? "Balance" : name]}
                            />
                            <Line type="monotone" dataKey="equity" stroke="var(--primary)" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="balance" stroke="var(--warning)" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                            <ReferenceLine y={drawdownLimit} stroke="hsl(0, 84%, 60%)" strokeWidth={1.5} strokeDasharray="3 3" label={{ value: `Drawdown Limit: ${fmt(drawdownLimit)}`, position: "insideTopLeft", fill: "hsl(0, 84%, 60%)", fontSize: 10 }} />
                            <ReferenceLine y={profitTarget} stroke="hsl(142, 76%, 36%)" strokeWidth={1.5} strokeDasharray="3 3" label={{ value: `Target: ${fmt(profitTarget)}`, position: "insideTopRight", fill: "hsl(142, 76%, 36%)", fontSize: 10 }} />
                            <ReferenceLine y={currentBalance} stroke="hsl(45, 93%, 47%)" strokeWidth={1} strokeDasharray="4 4" label={{ value: `Balance: ${fmt(currentBalance)}`, position: "insideBottomRight", fill: "hsl(45, 93%, 47%)", fontSize: 10 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : snapshots.length > 0 ? (
                    <div className="rounded-xl border border-border bg-card p-6">
                      <h3 className="font-display flex items-center gap-2 text-base font-semibold"><Activity className="h-4 w-4 text-primary"/>Equity Curve{liveStatus === 'live' ? (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-xs font-display text-green-500">Live</span>
            </span>
          ) : liveStatus === 'connecting' ? (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground" />
              </span>
              <span className="text-xs font-display text-muted-foreground">Connecting...</span>
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-xs font-display text-red-500">Reconnecting...</span>
            </span>
          )}</h3>
                      <p className="mt-4 text-sm text-muted-foreground">Not enough data yet. The equity sync runs every minute — check back soon.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card p-6">
                      <h3 className="font-display flex items-center gap-2 text-base font-semibold"><Activity className="h-4 w-4 text-primary"/>Equity Curve{liveStatus === 'live' ? (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-xs font-display text-green-500">Live</span>
            </span>
          ) : liveStatus === 'connecting' ? (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground" />
              </span>
              <span className="text-xs font-display text-muted-foreground">Connecting...</span>
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-xs font-display text-red-500">Reconnecting...</span>
            </span>
          )}</h3>
                      <p className="mt-4 text-sm text-muted-foreground">No equity data yet. The equity sync runs every minute — check back soon.</p>
                    </div>
                  )}

                  {phaseInfo.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {phaseInfo.map((p) => (
                        <button key={p.key} onClick={() => setSelectedPhase(p.key)}
                          className={`font-display rounded-md border px-3 py-1.5 text-xs ${selectedPhase === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {snapshots.length > 0 && (
                    <TradingAnalytics
                      snapshots={phaseSnapshots}
                      startingBalance={start}
                      currentEquity={phaseEquity}
                      maxDrawdownPercent={maxDD}
                      profitTargetPercent={target}
                      minTradingDays={selected.currency === "USD" ? 5 : (selected.challenges?.min_trading_days ?? 3)}
                      currentPhase={selectedPhase === "phase1" ? 1 : selectedPhase === "phase2" ? 2 : selected.current_phase}
                      status={selectedPhase === "funded" ? "funded" : "active"}
                      tradingDays={selected.trading_days ?? 0}
                      currency={selected.currency}
                      maxDailyDrawdownPercent={maxDailyDD ?? undefined}
                      dailyDrawdownPercent={dailyDrawdownPercent}
                      drawdownType={drawdownType}
                      currentDrawdownPercent={ddPct}
                    />
                  )}

                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="font-display text-base font-semibold">MT5 Credentials</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {[["Login", selected.mt5_login],["Password", selected.mt5_password],["Server", selected.mt5_server]].map(([l, v]) => (
                        <div key={l} className="rounded-md border border-border bg-background p-3">
                          <div className="text-[11px] text-muted-foreground">{l}</div>
                          <div className="font-display mt-1 text-sm text-primary break-all">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* KYC: bank account on file (only KYC field) */}
                  <div className={`rounded-xl border p-6 ${kycVerified ? "border-primary/30 bg-primary/5" : "border-warning/40 bg-warning/5"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-display flex items-center gap-2 text-base font-semibold">
                          {kycVerified ? <ShieldCheck className="h-4 w-4 text-primary"/> : <ShieldAlert className="h-4 w-4 text-warning"/>}
                          KYC — Payout Bank Account
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          We verify your bank instantly via Paystack. The account name must match the name on your trader profile. Payouts go only to this account.
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
                          {bankAccountNumber || profile.bank_account_number} · {bankName || profile.bank_name} · {bankAccountName || profile.bank_account_name}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Need to change it? Re-verify with new details — KYC will reset until the new account passes.
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor="bank-acct">Account number</Label>
                        <Input id="bank-acct" inputMode="numeric" maxLength={10} placeholder="10-digit NUBAN" className="mt-1 font-mono" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ""))} />
                      </div>
                      <div>
                        <Label htmlFor="bank-select">Bank</Label>
                        <Select value={bankCode} onValueChange={(v) => { setBankCode(v); setBankName(banks.find((b) => b.code === v)?.name ?? ""); }}>
                          <SelectTrigger id="bank-select" className="mt-1">
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
                   KYC is only available after you become a funded trader. {selected?.status !== "funded" && <span className="font-display text-warning">Complete your challenge to unlock this feature.</span>}
                   {selected?.status === "funded" && <>We'll fetch the registered account name from your bank and approve KYC instantly if it matches your profile name (<span className="font-display text-foreground">{profile?.full_name || "—"}</span>).</>}
                 </p>
                      <Button size="sm" className="mt-4 font-display" onClick={verifyBankWithPaystack} disabled={verifyingKyc || !bankCode || bankAccountNumber.length !== 10 || selected?.status !== "funded"}>
                       <Landmark className="mr-1 h-4 w-4"/>{verifyingKyc ? "Verifying…" : kycVerified ? "Re-verify bank" : "Verify bank account"}
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

                    {selected.status === "funded" && (
                    <>
                      {(() => {
                        const isUSD = selected.currency === "USD";
                        const cooldownDays = isUSD ? 10 : 7;
                        const lastPayout = payouts.find(
                          (p) => ["approved", "paid"].includes(p.status) &&
                                 (p as Payout & { trader_account_id?: string }).trader_account_id === selected.id
                        );
                        const lastPayoutDate = lastPayout?.created_at
                          ? new Date(lastPayout.created_at)
                          : selected.last_payout_date
                            ? new Date(selected.last_payout_date)
                            : null;
                        const next = lastPayoutDate
                          ? isUSD
                            ? addBusinessDays(lastPayoutDate, 10)
                            : new Date(lastPayoutDate.getTime() + 7 * 86400000)
                          : null;
                        const ready = !next || next.getTime() <= Date.now();
                        return (
                          <>
                            {next && <PayoutCountdown nextPayoutDate={next} businessDays={cooldownDays} isUsd={isUSD} />}
                            <div className="rounded-xl border border-primary/40 bg-primary/5 p-6">
                              <h3 className="font-display text-lg font-bold text-primary">🎉 You're funded — request payout</h3>
                               <p className="mt-1 text-sm text-muted-foreground">
                                  80% of profits paid to your verified bank account, processed within 24hrs of approval. {isUSD ? "10 business days" : "7 calendar days"} between requests · {isUSD ? "first 2 payouts capped at 6%, subsequent at 10%" : "min 10% / max 50% of account size"}.
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {isUSD
                                    ? <><span className="font-display text-foreground">First 2 payouts:</span> capped at 6% of account size each (you receive 80% of profit). Subsequent payouts use the 10% cap.</>
                                    : <><span className="font-display text-foreground">First payout:</span> capped at 10% of account size (you receive 80% of profit). Subsequent payouts use the full 50% cap.</>
                                  }
                               </p>
                               {!kycVerified && (
                                 <Alert variant="destructive" className="mt-3">
                                   <AlertDescription>Your bank account is awaiting admin verification before payouts are released.</AlertDescription>
                                 </Alert>
                               )}
                               {kycVerified && profile.bank_account_number && (
                                <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
                                  <div className="text-[11px] text-muted-foreground">Payout destination</div>
                                  <div className="font-display mt-1 text-primary break-words">
                                    {profile.bank_account_number} · {profile.bank_name} · {profile.bank_account_name}
                                  </div>
                                </div>
                              )}
                              {ready ? (
                                <Button className="font-display mt-4" onClick={requestPayout} disabled={submitting || !kycVerified}>
                                  {submitting ? "Submitting…" : "Request payout →"}
                                </Button>
                              ) : (
                                <p className="mt-4 text-xs text-muted-foreground">
                                  Request button unlocks when the countdown above hits zero.
                                </p>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                </>
              ); })()}
            </TabsContent>

            <TabsContent value="accounts" className="mt-6 space-y-3">
              {accounts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex-1 min-w-[160px]">
                    <div className="font-display text-primary">{a.mt5_login}</div>
                    <div className="text-xs text-muted-foreground">{a.challenges?.name}</div>
                  </div>
                  <div className="text-sm">{a.currency === "USD" ? formatUSD(a.starting_balance) : formatNaira(a.starting_balance)}</div>
                  <div className="font-display text-sm text-gold">{a.status === "funded" ? "FUNDED" : `Phase ${a.current_phase}/${a.challenges?.phases ?? 2}`}</div>
                    <Badge className={`${statusVariant[a.status]} font-display`}>{a.status.toUpperCase()}</Badge>
                  {a.status === "breached" && a.breach_reason && (
                    <p className="w-full text-xs text-destructive">{a.breach_reason}</p>
                  )}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="payouts" className="mt-6 space-y-3">
              {payouts.length === 0 ? <p className="text-muted-foreground">No payouts yet.</p> : payouts.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex-1">
                    <div className="font-display font-semibold">{formatNaira(p.amount_naira)}</div>
                    <div className="text-xs text-muted-foreground">{p.payment_method} · {new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                  <Badge className="font-display" variant="outline">{p.status.toUpperCase()}</Badge>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="certificates" className="mt-6 space-y-4">
              {certificates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
                  <Trophy className="mx-auto h-10 w-10 text-muted-foreground"/>
                  <p className="font-display mt-3 text-base font-semibold">No certificates yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Pass your evaluation or receive a payout to earn one.</p>
                </div>
              ) : (
                certificates.map((c) => <CertificateCard key={c.id} cert={c} />)
              )}
            </TabsContent>

            <TabsContent value="notifications" className="mt-6 space-y-2">
              {notifications.length === 0 ? <p className="text-muted-foreground">No notifications.</p> : notifications.map((n) => (
                <div key={n.id} className={`rounded-xl border bg-card p-4 ${n.is_read ? "border-border" : "border-primary/40"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between"><div className="font-semibold">{n.title}</div><div className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</div></div>
                      <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                    </div>
                    {!n.is_read && (
                      <Button size="sm" variant="outline" className="shrink-0 mt-0.5" onClick={async () => {
                        await supabase.from("notifications").update({ is_read: true } as never).eq("id", n.id);
                        setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
                      }}>OKAY</Button>
                    )}
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>

        )}
      </div>
      <NewUserInstallPrompt />

      <Dialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-xl">
              <XCircle className="h-5 w-5 text-destructive" />
              Cannot request {blockedType === "phase2" ? "Phase 2" : "Funded"} approval
            </DialogTitle>
            <DialogDescription>
              <div className="mt-3 space-y-3">
                {blockedReasons.map((r, i) => (
                  <div key={i} className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div>
                        <div className="font-display text-sm font-semibold text-destructive">{r.reason}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{r.current}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Complete all requirements above before requesting.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
