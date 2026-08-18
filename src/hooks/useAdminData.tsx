import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { formatNaira } from "@/lib/utils";
import { verifyKycServer, verifyKycDocumentServer, rejectKycDocumentServer } from "@/server/kyc.functions";
import { addSocialProofServer, updateSocialProofServer, deleteSocialProofServer, approvePhase2Server, approveFundedServer, provisionPayoutServer } from "@/server/admin.functions";
import { notifyEmail } from "@/lib/notify-email";


const blankChallenge = {
  id: "", name: "", account_size: 200000, price_naira: 12000, usd_price: "", currency: "NGN",
  profit_target_percent: 10, phase2_profit_target_percent: "", max_drawdown_percent: 20,
  phases: 2, is_active: true, challenge_type: "standard", max_daily_drawdown_percent: 10, max_trading_days: 45, discount_percent: 0,
  min_trading_days: 3,
  drawdown_type: "trailing_balance",
};

function useAdminDataHook() {
  const { session, user, profile } = useAuth();
  const [stats, setStats] = useState({ traders: 0, accounts: 0, funded: 0, active: 0, passed: 0, breached: 0, pending: 0, revenue: 0, paid: 0, sold: 0, passRate: 0 });
  const [unprovisionedOrders, setUnprovisionedOrders] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [delivering, setDelivering] = useState(false);
  const [deliverFor, setDeliverFor] = useState<any | null>(null);
  const [form, setForm] = useState({ login: "", password: "", investor: "", server: "" });
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketMessages, setTicketMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [affPayouts, setAffPayouts] = useState<any[]>([]);
  const [freeClaims, setFreeClaims] = useState<any[]>([]);
  const [affSaving, setAffSaving] = useState<string | null>(null);
  const [affiliateStats, setAffiliateStats] = useState<any[]>([]);
  const [affiliateSummary, setAffiliateSummary] = useState({ total: 0, referrals: 0, earned: 0, paid: 0, pending: 0, revenue: 0 });
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerPayouts, setPartnerPayouts] = useState<any[]>([]);
  const [partnerSaving, setPartnerSaving] = useState<string | null>(null);
  const [newPartnerEmail, setNewPartnerEmail] = useState("");
  const [newPartnerRate, setNewPartnerRate] = useState("20");
  const [newPartnerChallengeId, setNewPartnerChallengeId] = useState("");
  const [newPartnerPromoCode, setNewPartnerPromoCode] = useState("");
  const [addingPartner, setAddingPartner] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any | null>(null);
  const [editRateValue, setEditRateValue] = useState("");
  const [editChallengeId, setEditChallengeId] = useState("");
  const [editPromoCode, setEditPromoCode] = useState("");
  const [partnerFreeAccounts, setPartnerFreeAccounts] = useState<any[]>([]);
  const [deliverClaimFor, setDeliverClaimFor] = useState<any | null>(null);
  const [claimForm, setClaimForm] = useState({ login: "", password: "", investor: "", server: "" });
  const [deliveringClaim, setDeliveringClaim] = useState(false);
  const [deliverPartnerFreeFor, setDeliverPartnerFreeFor] = useState<any | null>(null);
  const [partnerFreeForm, setPartnerFreeForm] = useState({ login: "", password: "", investor: "", server: "" });
  const [deliveringPartnerFree, setDeliveringPartnerFree] = useState(false);
  const [discountCodes, setDiscountCodes] = useState<any[]>([]);
  const [discountForm, setDiscountForm] = useState({ code: "", percent_off: "15", max_redemptions: "", expires_at: "", is_active: true, challenge_id: "" });
  const [discountSaving, setDiscountSaving] = useState<string | null>(null);
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [tgSaving, setTgSaving] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [equityDraft, setEquityDraft] = useState<Record<string, string>>({});
  const [equitySaving, setEquitySaving] = useState<string | null>(null);
  const [kycTarget, setKycTarget] = useState<any | null>(null);
  const [kycVerifying, setKycVerifying] = useState(false);
  const [kycRejectReason, setKycRejectReason] = useState("");
  const [kycRejecting, setKycRejecting] = useState(false);
  const [breachTarget, setBreachTarget] = useState<any | null>(null);
  const [breachReason, setBreachReason] = useState("");
  const [breaching, setBreaching] = useState(false);
  const [breachType, setBreachType] = useState("inactivity");
  const [breachPair, setBreachPair] = useState("");
  const [breachOpenTime, setBreachOpenTime] = useState("");
  const [breachCloseTime, setBreachCloseTime] = useState("");
  const [breachDuration, setBreachDuration] = useState("");
  const [warnTarget, setWarnTarget] = useState<any | null>(null);
  const [warnReason, setWarnReason] = useState("");
  const [warnType, setWarnType] = useState("inactivity");
  const [warnPair, setWarnPair] = useState("");
  const [warnOpenTime, setWarnOpenTime] = useState("");
  const [warnCloseTime, setWarnCloseTime] = useState("");
  const [warnDuration, setWarnDuration] = useState("");
  const [warning, setWarning] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectType, setRejectType] = useState<"phase2" | "funded" | null>(null);
  const [payoutRejectTarget, setPayoutRejectTarget] = useState<any | null>(null);
  const [payoutRejectReason, setPayoutRejectReason] = useState("");
  const [payoutRejecting, setPayoutRejecting] = useState(false);
  const [poolAccounts, setPoolAccounts] = useState<any[]>([]);
  const [poolInventory, setPoolInventory] = useState<Record<string, Record<number, number>>>({});
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolFormOpen, setPoolFormOpen] = useState(false);
  const [poolSaving, setPoolSaving] = useState(false);
  const [viewCredsFor, setViewCredsFor] = useState<any | null>(null);
  const [poolForm, setPoolForm] = useState({ mt5_login: "", mt5_password: "", investor_password: "", mt5_server: "Exness-MT5Trial9", account_size_ngn: "", account_size_usd: "", currency: "NGN", phase: "1", notes: "" });
  const [socialItems, setSocialItems] = useState<any[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState("");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadCategory, setUploadCategory] = useState("payout");
  const [uploadOrder, setUploadOrder] = useState("0");
  const [uploading, setUploading] = useState(false);
  const [savingSocialOrder, setSavingSocialOrder] = useState<string | null>(null);
  const [socialDeleting, setSocialDeleting] = useState<string | null>(null);
  const [challengeList, setChallengeList] = useState<any[]>([]);
  const [challengeEditOpen, setChallengeEditOpen] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<any | null>(null);
  const [challengeForm, setChallengeForm] = useState<any>(blankChallenge);
  const [savingChallenge, setSavingChallenge] = useState(false);

  const loadChallenges = async () => {
    const { data, error } = await supabase.from("challenges").select("*").order("account_size");
    if (error) return console.error("[admin] challenges load failed:", error);
    setChallengeList((data ?? []) as any[]);
  };

  const openNewChallenge = () => { setEditingChallenge(null); setChallengeForm(blankChallenge); setChallengeEditOpen(true); };
  const openEditChallenge = (c: any) => { setEditingChallenge(c); setChallengeForm({ ...c }); setChallengeEditOpen(true); };

  const saveChallenge = async () => {
    if (!challengeForm.name.trim()) return toast.error("Name is required");
    setSavingChallenge(true);
    const payload: any = {
      name: challengeForm.name.trim(), account_size: Number(challengeForm.account_size), price_naira: Number(challengeForm.price_naira),
      usd_price: challengeForm.currency === "USD" ? Number(challengeForm.usd_price) || 0 : null,
      currency: challengeForm.currency || "NGN",
      profit_target_percent: Number(challengeForm.profit_target_percent), phase2_profit_target_percent: Number(challengeForm.phase2_profit_target_percent) || null, max_drawdown_percent: Number(challengeForm.max_drawdown_percent),
      phases: Number(challengeForm.phases), is_active: !!challengeForm.is_active,
      challenge_type: challengeForm.challenge_type === "instant" ? "instant" : "standard",
      max_daily_drawdown_percent: Number(challengeForm.max_daily_drawdown_percent) || null,
      max_trading_days: challengeForm.challenge_type === "instant" ? Number(challengeForm.max_trading_days) || null : null,
      min_trading_days: Number(challengeForm.min_trading_days) || 3,
      discount_percent: Number(challengeForm.discount_percent) || 0,
      drawdown_type: challengeForm.drawdown_type || "trailing_balance",
    };
    let error;
    if (editingChallenge?.id) ({ error } = await supabase.from("challenges").update(payload).eq("id", editingChallenge.id));
    else ({ error } = await supabase.from("challenges").insert(payload));
    setSavingChallenge(false);
    if (error) return toast.error(error.message);
    toast.success(editingChallenge?.id ? "Challenge updated" : "Challenge added"); setChallengeEditOpen(false); loadChallenges();
  };

  const toggleChallengeActive = async (c: any) => {
    const { error } = await supabase.from("challenges").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) return toast.error(error.message); toast.success(c.is_active ? "Deactivated" : "Activated"); loadChallenges();
  };

  const [deletingChallengeId, setDeletingChallengeId] = useState<string | null>(null);
  const deleteChallenge = async (c: any) => {
    setDeletingChallengeId(c.id);
    const { count: orderCount } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("challenge_id", c.id);
    const { count: accountCount } = await supabase.from("trader_accounts").select("id", { count: "exact", head: true }).eq("challenge_id", c.id);
    if ((orderCount ?? 0) > 0 || (accountCount ?? 0) > 0) {
      setDeletingChallengeId(null);
      const refs = [orderCount ? `${orderCount} order(s)` : "", accountCount ? `${accountCount} account(s)` : ""].filter(Boolean).join(" and ");
      return toast.error(`Cannot delete: ${refs} reference this challenge. Deactivate it instead.`);
    }
    const { error } = await supabase.from("challenges").delete().eq("id", c.id);
    setDeletingChallengeId(null);
    if (error) return toast.error(error.message);
    toast.success("Challenge deleted"); setChallengeEditOpen(false); loadChallenges();
  };

  const load = async () => {
    const [pr, ord, accRaw, poRaw, req, breachedRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("amount_paid,status,challenge_id"),
      supabase.from("trader_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("payouts").select("*").order("created_at", { ascending: false }),
      supabase.from("account_requests").select("*").in("status", ["pending", "failed"]).order("created_at", { ascending: false }),
      supabase.from("trader_accounts").select("id", { count: "exact", head: true }).eq("status", "breached"),
    ]);
    if (accRaw.error) console.error("[admin] trader_accounts load failed:", accRaw.error);
    if (poRaw.error) console.error("[admin] payouts load failed:", poRaw.error);
    if (req.error) console.error("[admin] account_requests load failed:", req.error);
    const accRows = (accRaw.data ?? []) as any[];
    const poRows = (poRaw.data ?? []) as any[];
    const reqRows = (req.data ?? []) as any[];
    const userIds = Array.from(new Set([...accRows.map((a) => a.user_id), ...poRows.map((p) => p.user_id), ...reqRows.map((r) => r.user_id)]));
    const challengeIds = Array.from(new Set([...accRows.map((a) => a.challenge_id), ...reqRows.map((r) => r.challenge_id), ...((ord.data ?? []) as any[]).map((o) => o.challenge_id)]));
    const orderIds = Array.from(new Set(reqRows.map((r) => r.order_id)));
    const accountIds = poRows.map((p) => p.trader_account_id).filter(Boolean);
    const [profRes, chRes, ordRes, taRes] = await Promise.all([
      userIds.length ? supabase.from("profiles").select("id, full_name, bank_account_number, bank_name, bank_account_name, kyc_verified").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
      challengeIds.length ? supabase.from("challenges").select("id, name, account_size, profit_target_percent, phase2_profit_target_percent, max_drawdown_percent, phases, drawdown_type").in("id", challengeIds) : Promise.resolve({ data: [] as any[] }),
      orderIds.length ? supabase.from("orders").select("id, status").in("id", orderIds) : Promise.resolve({ data: [] as any[] }),
      accountIds.length ? supabase.from("trader_accounts").select("id, mt5_login, currency, starting_balance, monitor_paused, monitor_paused_reason").in("id", accountIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const profMap = new Map((profRes.data ?? []).map((p: any) => [p.id, p]));
    const chMap = new Map((chRes.data ?? []).map((c: any) => [c.id, c]));
    const ordMap = new Map((ordRes.data ?? []).map((o: any) => [o.id, o]));
    const taMap = new Map((taRes.data ?? []).map((t: any) => [t.id, t]));
    const accList = accRows.map((a: any) => ({ ...a, profiles: profMap.get(a.user_id) ?? null, challenges: chMap.get(a.challenge_id) ?? null, _trading_days: a.trading_days ?? 0 }));
    const accMap = new Map(accList.map((a: any) => [a.id, a]));
    const poList = poRows.map((p: any) => ({ ...p, profiles: profMap.get(p.user_id) ?? null, trader_accounts: accMap.get(p.trader_account_id) ?? taMap.get(p.trader_account_id) ?? null }));
    const hydrated = reqRows.map((r: any) => ({ ...r, profiles: profMap.get(r.user_id) ?? null, challenges: chMap.get(r.challenge_id) ?? null, orders: ordMap.get(r.order_id) ?? null }));
    accList.sort((a: any, b: any) => { const score = (x: any) => { if (x.status !== "active") return 0; if (x.current_phase < 2 && x.phase2_requested_at) return 2; if (x.current_phase >= 2 && x.funded_requested_at) return 2; return 0; }; return score(b) - score(a); });
    setAccounts(accList); setPayouts(poList); setPendingRequests(hydrated);
    const ordersList = (ord.data ?? []) as any[];
    const soldOrders = ordersList.filter((o) => o.status === "paid" || o.status === "delivered");
    const soldCount = soldOrders.length; const soldValue = soldOrders.reduce((s: number, o: any) => s + Number(chMap.get(o.challenge_id)?.account_size ?? 0), 0);
    const passedCount = accList.filter((a) => a.status === "passed" || a.status === "funded").length;
    const passRate = soldCount > 0 ? Math.round((passedCount / soldCount) * 100) : 0;
    setStats({
      traders: pr.count ?? 0, accounts: accList.length, sold: soldValue, funded: accList.filter((a) => a.status === "funded").length,
      active: accList.filter((a) => a.status === "active").length, passed: accList.filter((a) => a.status === "passed").length,
      breached: breachedRes.count ?? 0, pending: poList.filter((p) => p.status === "pending").length,
      revenue: ordersList.filter((o) => o.status === "paid" || o.status === "delivered").reduce((s: number, o: any) => s + Number(o.amount_paid), 0) / 100,
      paid: poList.filter((p) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.amount_naira), 0), passRate,
    });
    try { const { data } = await supabase.rpc("find_unprovisioned_orders" as never); setUnprovisionedOrders((data as any[]) ?? []); } catch { setUnprovisionedOrders([]); }
  };

  const loadPool = async () => {
    setPoolLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/pool?variant=stats", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok) { setPoolInventory(json.inventory ?? {}); setPoolAccounts(json.rows ?? []); }
    } catch (e) { console.error("[admin] loadPool failed", e); } finally { setPoolLoading(false); }
  };

  useEffect(() => { load(); loadChallenges(); loadPool(); }, []);
  useEffect(() => { loadTickets(); }, []);
  useEffect(() => { loadAffiliate(); }, []);
  useEffect(() => { loadPartners(); }, []);
  useEffect(() => { loadDiscounts(); }, []);
  useEffect(() => { loadSocialItems(); }, []);
  useEffect(() => { loadTelegramConfig(); }, []);

  function loadTickets() {
    (async () => {
      const { data, error } = await supabase.from("tickets").select("*").order("created_at", { ascending: false });
      if (error) return console.error("[admin] tickets load failed:", error);
      const rows = (data ?? []) as any[];
      const userIds = Array.from(new Set(rows.map((t) => t.user_id)));
      const profMap = new Map<string, any>();
      if (userIds.length) { const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds); (profs ?? []).forEach((p: any) => profMap.set(p.id, p)); }
      setTickets(rows.map((t) => ({ ...t, profiles: profMap.get(t.user_id) ?? null })));
    })();
  }

  const loadTicketMessages = async (ticketId: string) => {
    const { data } = await supabase.from("ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
    setTicketMessages((data ?? []) as any[]);
  };

  const selectTicket = (t: any) => { setSelectedTicket(t); setReplyText(""); loadTicketMessages(t.id); };
  const closeTicketDetail = () => { setSelectedTicket(null); setTicketMessages([]); };

  const sendAdminReply = async () => {
    if (!selectedTicket) return;
    if (!session?.user?.id) return toast.error("Please sign in again");
    const text = replyText.trim();
    if (!text) return toast.error("Type a reply first");
    setReplySaving(true);
    const { error } = await supabase.from("ticket_messages").insert({ ticket_id: selectedTicket.id, sender_id: session.user.id, sender_role: "admin", message: text });
    setReplySaving(false);
    if (error) return toast.error(error.message);
    await supabase.rpc("send_telegram", { p_message: `<b>Support Ticket Updated</b>\nTrader: ${selectedTicket.profiles?.full_name ?? "—"}\nSubject: ${selectedTicket.subject}\nAdmin replied to ticket.` });
    await supabase.from("notifications").insert({ user_id: selectedTicket.user_id, title: "Support Ticket Update", message: `Admin replied to your ticket "${selectedTicket.subject}".`, type: "info" });
    toast.success("Reply sent"); setReplyText(""); await loadTicketMessages(selectedTicket.id); loadTickets();
  };

  const updateTicketStatus = async (t: any, newStatus: string) => {
    setStatusUpdating(t.id);
    const { error } = await supabase.from("tickets").update({ status: newStatus } as never).eq("id", t.id);
    setStatusUpdating(null);
    if (error) return toast.error(error.message);
    await supabase.rpc("send_telegram", { p_message: `<b>Support Ticket ${newStatus.replace("_", " ").toUpperCase()}</b>\nTrader: ${t.profiles?.full_name ?? "—"}\nSubject: ${t.subject}\nStatus changed to ${newStatus.replace("_", " ")}.` });
    await supabase.from("notifications").insert({ user_id: t.user_id, title: "Support Ticket Updated", message: `Your ticket "${t.subject}" status changed to ${newStatus.replace("_", " ")}.`, type: "info" });
    toast.success(`Status changed to ${newStatus.replace("_", " ")}`);
    if (selectedTicket?.id === t.id) setSelectedTicket((prev: any) => prev ? { ...prev, status: newStatus } : null);
    loadTickets();
  };

  const statusFlow: Record<string, string[]> = { open: ["in_progress"], in_progress: ["resolved"], resolved: ["open"] };

  const openDeliver = (req: any) => { setDeliverFor(req); setForm({ login: "", password: "", investor: "", server: "" }); };

  const submitDelivery = async () => {
    if (!deliverFor) return;
    if (!form.login.trim() || !form.password.trim() || !form.server.trim()) { toast.error("Login, password and server are required"); return; }
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) { toast.error("Please sign in again"); return; }
    setDelivering(true);
    try {
      const res = await fetch("/api/deliver-account", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session.access_token}` }, body: JSON.stringify({ order_id: deliverFor.order_id, mt5_login: form.login.trim(), mt5_password: form.password.trim(), investor_password: form.investor.trim() || undefined, mt5_server: form.server.trim() }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Delivery failed");
      toast.success(`Delivered: login ${json.login}`); setDeliverFor(null); load();
    } catch (e: any) { toast.error(e?.message ?? "Delivery failed"); } finally { setDelivering(false); }
  };

  const deleteRequest = async (req: any) => {
    if (!confirm(`Delete this pending request for ${req.profiles?.full_name ?? "trader"}? This will also cancel the order.`)) return;
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) { toast.error("Please sign in again"); return; }
    try {
      const res = await fetch("/api/admin/delete-request", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session.access_token}` }, body: JSON.stringify({ request_id: req.id }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Delete failed"); toast.success("Request deleted"); load();
    } catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
  };

  const updatePayout = async (p: any, status: "approved" | "paid" | "rejected") => {
    const { error } = await supabase.from("payouts").update({ status, processed_at: new Date().toISOString() }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(`Payout ${status}`);
    if (status === "approved") notifyEmail({ type: "payout_approved", payoutId: p.id });
    if (status === "paid") {
      notifyEmail({ type: "payout_paid", payoutId: p.id });
      const res = await provisionPayoutServer({ data: { accessToken: sess.session.access_token, payoutId: p.id } });
      if (res?.ok) {
        toast.success("Payout paid — new account provisioned");
      } else {
        toast.error(res?.error ?? "Provision failed — check pool availability");
      }
    }
    if (status === "rejected") notifyEmail({ type: "payout_rejected", payoutId: p.id, reason: "Rejected by admin." });
    load();
  };

  const updateAccount = async (id: string, patch: Record<string, any>) => {
    const { error } = await supabase.from("trader_accounts").update(patch as never).eq("id", id);
    if (error) return toast.error(error.message); toast.success("Account updated"); load();
  };

  const resetAccountBalance = async (account: any) => {
    if (!confirm(`Reset balance for ${account.profiles?.full_name ?? "trader"} (${account.mt5_login})? Equity will reset to ${formatNaira(account.starting_balance)}.`)) return;
    const { error } = await supabase.from("trader_accounts").update({
      current_equity: account.starting_balance,
      peak_equity: account.starting_balance,
      daily_peak_equity: account.starting_balance,
      daily_peak_date: new Date().toISOString().slice(0, 10),
      trading_days: 0,
    } as never).eq("id", account.id);
    if (error) return toast.error(error.message);
    await supabase.from("account_snapshots").insert({ trader_account_id: account.id, equity: account.starting_balance, balance: account.starting_balance, profit: 0, drawdown_percent: 0, snapshot_time: new Date().toISOString() } as never);
    toast.success("Account balance reset");
    load();
  };

  const approvePhase2 = async (a: any) => {
    if (a.current_phase >= 2) return toast.error("Already in Phase 2 or beyond");
    if (!confirm(`Approve Phase 2 for ${a.profiles?.full_name ?? "trader"}? A new account will be provisioned from the pool.`)) return;
    if (!session?.access_token) return toast.error("Please sign in again");
    try {
      const result = await approvePhase2Server({ data: { accessToken: session.access_token, accountId: a.id } });
      if (!result?.ok) return toast.error(result?.error ?? "Approval failed");
      toast.success("Phase 2 approved — new account provisioned");
      notifyEmail({ type: "phase1_passed", accountId: a.id });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    }
  };

  const approveFunded = async (a: any) => {
    if (a.status === "funded") return toast.error("Already funded");
    if (!confirm(`Approve Funded status for ${a.profiles?.full_name ?? "trader"}? A new funded account will be provisioned from the pool.`)) return;
    if (!session?.access_token) return toast.error("Please sign in again");
    try {
      const result = await approveFundedServer({ data: { accessToken: session.access_token, accountId: a.id } });
      if (!result?.ok) return toast.error(result?.error ?? "Approval failed");
      toast.success("Funded status approved — new account provisioned");
      notifyEmail({ type: "funded", accountId: a.id });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    }
  };

  const submitEquity = async (account: any) => {
    const raw = equityDraft[account.id]?.trim();
    if (!raw) return toast.error("Enter an equity value");
    const equity = Number(raw);
    if (!Number.isFinite(equity) || equity < 0) return toast.error("Equity must be a positive number");
    setEquitySaving(account.id);
    const starting = Number(account.starting_balance) || 0;
    const peak = Math.max(starting, Number(account.peak_equity ?? starting), equity);
    const profit = equity - starting;
    const drawdown = peak > 0 ? Math.max(0, ((peak - equity) / peak) * 100) : 0;
    const { error } = await supabase.from("account_snapshots").insert({ trader_account_id: account.id, equity, balance: equity, profit, drawdown_percent: Number(drawdown.toFixed(2)) } as never);
    setEquitySaving(null);
    if (error) return toast.error(error.message); setEquityDraft((d) => ({ ...d, [account.id]: "" })); toast.success("Equity recorded — rules evaluated"); load();
  };

  const openKycVerify = (account: any) => { setKycTarget(account); setKycRejectReason(""); };
  const submitKycVerify = async () => {
    if (!kycTarget) return; if (!session?.access_token) return toast.error("Please sign in again");
    setKycVerifying(true);
    try {
      const hasDoc = kycTarget.profiles?.kyc_document_url;
      if (hasDoc) {
        const res = await verifyKycDocumentServer({ data: { userId: kycTarget.user_id, accessToken: session.access_token } });
        if (!res?.ok) { toast.error(res?.error ?? "Verification failed"); return; }
      } else {
        const accountNumber = (kycTarget.profiles?.bank_account_number ?? "").trim();
        if (!accountNumber) { toast.error("Trader hasn't submitted bank details or KYC document"); setKycVerifying(false); return; }
        const res = await verifyKycServer({ data: { userId: kycTarget.user_id, accountNumber, accessToken: session.access_token } });
        if (!res?.ok) { toast.error(res?.error ?? "Verification failed"); return; }
      }
      toast.success("KYC verified"); setKycTarget(null); load();
    } catch (e: any) { toast.error(e?.message ?? "Verification failed"); } finally { setKycVerifying(false); }
  };
  const submitKycReject = async () => {
    if (!kycTarget) return; if (!session?.access_token) return toast.error("Please sign in again");
    if (!kycRejectReason.trim()) return toast.error("Enter a reason for rejection");
    setKycRejecting(true);
    try {
      const res = await rejectKycDocumentServer({ data: { userId: kycTarget.user_id, reason: kycRejectReason.trim(), accessToken: session.access_token } });
      if (!res?.ok) { toast.error(res?.error ?? "Rejection failed"); return; }
      toast.success("KYC document rejected"); setKycTarget(null); setKycRejectReason(""); load();
    } catch (e: any) { toast.error(e?.message ?? "Rejection failed"); } finally { setKycRejecting(false); }
  };

  const openBreachDialog = (account: any) => {
    const name = account?.profiles?.full_name ?? "Trader";
    setBreachTarget(account);
    setBreachType("inactivity");
    setBreachPair(""); setBreachOpenTime(""); setBreachCloseTime(""); setBreachDuration("");
    setBreachReason(`Hi ${name}, your FundedNG challenge account has been closed due to inactivity. Our rules require at least 1 trade every calendar week to keep your account active. Unfortunately no trading activity was detected on your account within the required period.\nYou're welcome to start a new challenge anytime at fundedng.fun 💪\n— FundedNG Team`);
  };
  const openWarningDialog = (account: any) => {
    const name = account?.profiles?.full_name ?? "Trader";
    setWarnTarget(account);
    setWarnType("inactivity");
    setWarnPair(""); setWarnOpenTime(""); setWarnCloseTime(""); setWarnDuration("");
    setWarnReason(`Hi ${name}, your FundedNG challenge account is at risk of being closed due to inactivity. Our rules require at least 1 trade every calendar week to keep your account active. Please place a trade to keep your account active.\n— FundedNG Team`);
  };
  const openRejectDialog = (account: any, type: "phase2" | "funded") => { setRejectTarget(account); setRejectType(type); setRejectReason(""); };
  const openPayoutRejectDialog = (payout: any) => { setPayoutRejectTarget(payout); setPayoutRejectReason(""); };
  const submitPayoutReject = async () => {
    if (!payoutRejectTarget) return;
    const reason = payoutRejectReason.trim();
    if (reason.length < 3) { toast.error("Please write a reason (min 3 chars)."); return; }
    setPayoutRejecting(true);
    try {
      const { error } = await supabase.from("payouts").update({ status: "rejected", processed_at: new Date().toISOString(), admin_note: reason }).eq("id", payoutRejectTarget.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Payout rejected");
      notifyEmail({ type: "payout_rejected", payoutId: payoutRejectTarget.id, reason });
      setPayoutRejectTarget(null); setPayoutRejectReason(""); load();
    } finally { setPayoutRejecting(false); }
  };

  const submitRejectPhase = async () => {
    if (!rejectTarget || !rejectType) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) { toast.error("Please write a reason (min 3 chars)."); return; }
    setRejecting(true);
    try {
      const isPhase2 = rejectType === "phase2";
      const patch: Record<string, any> = { ...(isPhase2 ? { phase2_requested_at: null } : { funded_requested_at: null }), phase_rejected_reason: reason, phase_rejected_at: new Date().toISOString() };
      const { error } = await supabase.from("trader_accounts").update(patch as never).eq("id", rejectTarget.id);
      if (error) { toast.error(error.message); return; }
      const phaseLabel = isPhase2 ? "Phase 2" : "Funded";
      await supabase.from("notifications").insert({ user_id: rejectTarget.user_id, title: `❌ ${phaseLabel} Request Rejected`, message: `Your ${phaseLabel} request for account ${rejectTarget.mt5_login} has been rejected. Reason: ${reason}`, type: "error" } as never);
      toast.success(`${phaseLabel} request rejected`); notifyEmail({ type: "phase_rejected", accountId: rejectTarget.id, reason, phaseType: rejectType });
      setRejectTarget(null); setRejectReason(""); setRejectType(null); load();
    } finally { setRejecting(false); }
  };

  const submitBreach = async () => {
    if (!breachTarget) return;
    const reason = breachReason.trim();
    if (reason.length < 3) { toast.error("Please write a breach reason (min 3 chars)."); return; }
    setBreaching(true);
    try {
      const { error } = await supabase.from("trader_accounts").update({ status: "breached", breach_reason: reason, phase_rejected_reason: null, phase_rejected_at: null } as never).eq("id", breachTarget.id);
      if (error) { toast.error(error.message); return; }
      const adminName = (profile?.full_name && profile.full_name.trim()) || (user?.email ?? null);
      await supabase.from("breach_audit_log").insert({ trader_account_id: breachTarget.id, user_id: breachTarget.user_id, admin_id: user?.id ?? null, admin_name: adminName, admin_email: user?.email ?? null, reason, mt5_login: breachTarget.mt5_login ?? null } as never).then(({ error: e }) => { if (e) console.error("[breach audit log] insert failed", e.message); });
      await supabase.from("notifications").insert({ user_id: breachTarget.user_id, title: "❌ Account breached", message: `Your account ${breachTarget.mt5_login} has been marked as breached. Reason: ${reason}`, type: "error" } as never);
      toast.success("Account breached. It has been archived."); notifyEmail({ type: "breached", accountId: breachTarget.id, reason });
      setBreachTarget(null); setBreachReason(""); load();
    } finally { setBreaching(false); }
  };

  const submitWarning = async () => {
    if (!warnTarget) return;
    const reason = warnReason.trim();
    if (reason.length < 3) { toast.error("Please write a warning reason (min 3 chars)."); return; }
    setWarning(true);
    try {
      const { error } = await supabase.from("notifications").insert({ user_id: warnTarget.user_id, title: "⚠️ Trading Warning", message: `Warning for account ${warnTarget.mt5_login}: ${reason}`, type: "warning" } as never);
      if (error) { toast.error(error.message); return; }
      toast.success("Warning sent to trader."); setWarnTarget(null); setWarnReason("");
    } finally { setWarning(false); }
  };

  const loadAffiliate = () => {
    (async () => {
      const [pRes, cRes, affRes, refRes, commRes, ordRes, chRes] = await Promise.all([
        supabase.from("affiliate_payouts").select("*").order("requested_at", { ascending: false }),
        supabase.from("affiliate_free_accounts").select("*").order("created_at", { ascending: false }),
        supabase.from("affiliate_profiles").select("*"),
        supabase.from("referrals").select("*"),
        supabase.from("affiliate_commissions").select("*"),
        supabase.from("orders").select("id, user_id, amount_paid, challenge_id, status").in("status", ["paid", "delivered"]),
        supabase.from("challenges").select("id, account_size"),
      ]);
      const payRows = (pRes.data ?? []) as any[]; const claimRows = (cRes.data ?? []) as any[];
      const affRows = (affRes.data ?? []) as any[]; const refRows = (refRes.data ?? []) as any[];
      const commRows = (commRes.data ?? []) as any[]; const ordRows = (ordRes.data ?? []) as any[]; const chRows = (chRes.data ?? []) as any[];
      const allUserIds = Array.from(new Set([...payRows.map((r) => r.user_id), ...claimRows.map((r) => r.affiliate_id), ...affRows.map((r) => r.user_id), ...refRows.map((r) => [r.referrer_id, r.referred_user_id]).flat()]));
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", allUserIds);
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      setAffPayouts(payRows.map((r: any) => ({ ...r, profiles: profMap.get(r.user_id) ?? null })));
      setFreeClaims(claimRows.map((r: any) => ({ ...r, profiles: profMap.get(r.affiliate_id) ?? null })));
      const chMap = new Map(chRows.map((c: any) => [c.id, c]));
      const refByAff = new Map<string, any[]>(); const commByAff = new Map<string, any[]>();
      for (const r of refRows) { const list = refByAff.get(r.referrer_id) ?? []; list.push(r); refByAff.set(r.referrer_id, list); }
      for (const c of commRows) { const list = commByAff.get(c.affiliate_user_id) ?? []; list.push(c); commByAff.set(c.affiliate_user_id, list); }
      const statsArr = affRows.map((a: any) => {
        const refs = refByAff.get(a.user_id) ?? []; const comms = commByAff.get(a.user_id) ?? [];
        const paidOrders = ordRows.filter((o) => refs.some((r) => r.referred_user_id === o.user_id));
        const revenue = paidOrders.reduce((s: number, o: any) => s + Number(o.amount_paid) / 100, 0);
        const accountSize = paidOrders.reduce((s: number, o: any) => { const ch = chMap.get(o.challenge_id); return s + (ch ? Number(ch.account_size) : 0); }, 0);
        return { ...a, profile: profMap.get(a.user_id) ?? null, referralCount: refs.length, paidReferralCount: refs.filter((r) => r.first_paid_at).length, pendingCommissions: comms.filter((c) => c.status === "pending").reduce((s: number, c: any) => s + Number(c.amount_naira), 0), totalRevenue: revenue, totalAccountSize: accountSize, ordersCount: paidOrders.length };
      });
      const filtered = statsArr.filter((a: any) => a.paidReferralCount > 0 || a.ordersCount > 0);
      filtered.sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);
      setAffiliateStats(filtered);
      setAffiliateSummary({ total: filtered.length, referrals: filtered.reduce((s: number, a: any) => s + a.paidReferralCount, 0), earned: filtered.reduce((s: number, a: any) => s + Number(a.total_earned_naira), 0), paid: filtered.reduce((s: number, a: any) => s + Number(a.total_paid_naira), 0), pending: filtered.reduce((s: number, a: any) => s + a.pendingCommissions, 0), revenue: filtered.reduce((s: number, a: any) => s + a.totalRevenue, 0) });
    })();
  };

  const loadPartners = () => {
    (async () => {
      const [pRes, payRes, freeRes] = await Promise.all([
        supabase.from("partner_profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("partner_payouts").select("*").order("requested_at", { ascending: false }),
        (supabase as any).from("partner_free_accounts").select("*, challenges(name, account_size, profit_target_percent, max_drawdown_percent, phases, currency)").order("requested_at", { ascending: false }),
      ]);
      const partnerRows = (pRes.data ?? []) as any[]; const payRows = (payRes.data ?? []) as any[]; const freeRows = (freeRes.data ?? []) as any[];
      const userIds = Array.from(new Set([...partnerRows.map((r) => r.user_id), ...payRows.map((r) => r.partner_id), ...freeRows.map((r) => r.partner_id)]));
      const challengeIds = Array.from(new Set(partnerRows.map((r) => r.free_account_challenge_id).filter(Boolean)));
      const profMap = new Map<string, any>();
      if (userIds.length) { const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds); (profs ?? []).forEach((p: any) => profMap.set(p.id, p)); }
      const chMap = new Map<string, any>();
      if (challengeIds.length) { const { data: chs } = await supabase.from("challenges").select("id, name, account_size, currency").in("id", challengeIds); (chs ?? []).forEach((c: any) => chMap.set(c.id, c)); }
      setPartners(partnerRows.map((r: any) => ({ ...r, profiles: profMap.get(r.user_id) ?? null, free_challenge: r.free_account_challenge_id ? (chMap.get(r.free_account_challenge_id) ?? null) : null })));
      setPartnerPayouts(payRows.map((r: any) => ({ ...r, profiles: profMap.get(r.partner_id) ?? null })));
      setPartnerFreeAccounts(freeRows.map((r: any) => ({ ...r, profiles: profMap.get(r.partner_id) ?? null })));
    })();
  };

  const loadDiscounts = () => {
    (async () => {
      const { data, error } = await (supabase as any).from("discount_codes").select("*").order("created_at", { ascending: false });
      if (error) return console.error("[admin] discount_codes load failed:", error);
      setDiscountCodes((data ?? []) as any[]);
    })();
  };

  const loadSocialItems = () => {
    (async () => {
      const { data } = await supabase.from("social_proof_items").select("*").order("display_order", { ascending: true });
      setSocialItems((data ?? []) as any[]);
    })();
  };

  const loadTelegramConfig = () => {
    (async () => {
      const { data } = await supabase.from("app_config").select("key, value").in("key", ["telegram_bot_token", "telegram_chat_id"]);
      (data ?? []).forEach((row: any) => { if (row.key === "telegram_bot_token") setTgBotToken(row.value ?? ""); if (row.key === "telegram_chat_id") setTgChatId(row.value ?? ""); });
    })();
  };

  const addPartner = async () => {
    const email = newPartnerEmail.trim(); const rate = Number(newPartnerRate);
    if (!email) return toast.error("Email is required");
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return toast.error("Commission must be 0-100");
    setAddingPartner(true);
    const { data: userId, error } = await supabase.rpc("assign_partner_role", { _email: email, _commission_rate: rate });
    if (error) { setAddingPartner(false); return toast.error(error.message); }
    const challengeVal = newPartnerChallengeId === "__none__" ? null : newPartnerChallengeId;
    if (userId) {
      const updates: any = { free_account_challenge_id: challengeVal || null };
      const customCode = newPartnerPromoCode.trim();
      if (customCode) {
        updates.promo_code = customCode.toUpperCase();
      }
      const { error: upErr } = await supabase.from("partner_profiles").update(updates as never).eq("user_id", userId);
      if (upErr) toast.error("Partner created but promo code not saved: " + upErr.message);
    }
    setAddingPartner(false);
    toast.success("Partner added"); setNewPartnerEmail(""); setNewPartnerRate("20"); setNewPartnerChallengeId(""); setNewPartnerPromoCode(""); loadChallenges(); loadPartners();
  };

  const saveCommissionRate = async () => {
    if (!editingPartner) return;
    const rate = Number(editRateValue);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return toast.error("Commission must be 0-100");
    setPartnerSaving(editingPartner.id);
    const updates: any = { commission_rate: rate };
    if (editChallengeId !== editingPartner.free_account_challenge_id) {
      updates.free_account_challenge_id = editChallengeId || null;
    }
    const codeChanged = editPromoCode.trim().toUpperCase() !== editingPartner.promo_code;
    if (codeChanged) {
      const customCode = editPromoCode.trim().toUpperCase();
      if (customCode.length < 3) { setPartnerSaving(null); return toast.error("Promo code must be at least 3 characters"); }
      const { error: codeErr } = await supabase.rpc("update_partner_promo_code", { _partner_profile_id: editingPartner.id, _new_code: customCode });
      if (codeErr) { setPartnerSaving(null); return toast.error(codeErr.message); }
    }
    const { error } = await supabase.from("partner_profiles").update(updates as never).eq("id", editingPartner.id);
    setPartnerSaving(null);
    if (error) return toast.error(error.message); toast.success("Partner updated"); setEditingPartner(null); loadPartners();
  };

  const togglePartnerActive = async (p: any) => {
    setPartnerSaving(p.id);
    const { error } = await supabase.from("partner_profiles").update({ is_active: !p.is_active } as never).eq("id", p.id);
    setPartnerSaving(null);
    if (error) return toast.error(error.message); toast.success(p.is_active ? "Deactivated" : "Activated"); loadPartners();
  };

  const deletePartner = async (p: any) => {
    if (!confirm(`Delete partner ${p.profiles?.full_name ?? p.promo_code}? This cannot be undone.`)) return;
    setPartnerSaving(p.id);
    const { error } = await supabase.rpc("delete_partner_role" as any, { _partner_profile_id: p.id });
    setPartnerSaving(null);
    if (error) return toast.error(error.message); toast.success("Partner deleted"); loadPartners();
  };

  const setPartnerPayoutStatus = async (id: string, status: "approved" | "paid" | "rejected") => {
    setPartnerSaving(id);
    const { error } = await supabase.from("partner_payouts").update({ status } as never).eq("id", id);
    setPartnerSaving(null);
    if (error) return toast.error(error.message); toast.success(`Marked ${status}`); loadPartners();
  };

  const openDeliverPartnerFree = (claim: any) => { setDeliverPartnerFreeFor(claim); setPartnerFreeForm({ login: "", password: "", investor: "", server: "" }); };

  const submitDeliverPartnerFree = async () => {
    if (!deliverPartnerFreeFor) return;
    if (!partnerFreeForm.login.trim() || !partnerFreeForm.password.trim() || !partnerFreeForm.server.trim()) { return toast.error("Login, password and server are required"); }
    setDeliveringPartnerFree(true);
    const challengeId = deliverPartnerFreeFor.challenge_id;
    if (!challengeId) { setDeliveringPartnerFree(false); return toast.error("No challenge linked to this request."); }
    const accountSize = Number(deliverPartnerFreeFor.challenges?.account_size ?? deliverPartnerFreeFor.account_size ?? 1000000);
    const { error } = await (supabase as any).from("partner_free_accounts").update({ status: "fulfilled", mt5_login: partnerFreeForm.login.trim(), mt5_password: partnerFreeForm.password.trim(), investor_password: partnerFreeForm.investor.trim() || null, mt5_server: partnerFreeForm.server.trim(), fulfilled_at: new Date().toISOString() }).eq("id", deliverPartnerFreeFor.id);
    if (error) { setDeliveringPartnerFree(false); return toast.error(error.message); }
    const { error: taError } = await (supabase as any).from("trader_accounts").insert({ user_id: deliverPartnerFreeFor.partner_id, challenge_id, order_id: null, mt5_login: partnerFreeForm.login.trim(), mt5_password: partnerFreeForm.password.trim(), investor_password: partnerFreeForm.investor.trim() || null, mt5_server: partnerFreeForm.server.trim(), starting_balance: accountSize, current_equity: accountSize, current_phase: 1, status: "active", provider: "exness-bot" });
    setDeliveringPartnerFree(false);
    if (taError) return toast.error(taError.message);
    const chName = deliverPartnerFreeFor.challenges?.name ?? "Partner";
    toast.success(`Delivered ${chName} partner account: login ${partnerFreeForm.login}`); setDeliverPartnerFreeFor(null); load(); loadPartners();
  };

  const saveDiscountCode = async () => {
    const code = discountForm.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const percent = Number(discountForm.percent_off);
    if (!code) return toast.error("Promo code is required");
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return toast.error("Discount must be 1-100%");
    setDiscountSaving("new");
    const { error } = await (supabase as any).from("discount_codes").upsert({ code, percent_off: percent, max_redemptions: discountForm.max_redemptions ? Number(discountForm.max_redemptions) : null, expires_at: discountForm.expires_at ? new Date(discountForm.expires_at).toISOString() : null, is_active: discountForm.is_active, challenge_id: discountForm.challenge_id || null }, { onConflict: "code" });
    setDiscountSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Promo discount saved"); setDiscountForm({ code: "", percent_off: "15", max_redemptions: "", expires_at: "", is_active: true, challenge_id: "" }); loadDiscounts();
  };

  const toggleDiscountActive = async (d: any) => {
    setDiscountSaving(d.id);
    const { error } = await (supabase as any).from("discount_codes").update({ is_active: !d.is_active }).eq("id", d.id);
    setDiscountSaving(null);
    if (error) return toast.error(error.message); toast.success(d.is_active ? "Promo deactivated" : "Promo activated"); loadDiscounts();
  };

  const setAffPayoutStatus = async (id: string, status: "approved" | "paid" | "rejected") => {
    setAffSaving(id);
    const { error } = await supabase.from("affiliate_payouts").update({ status } as never).eq("id", id);
    setAffSaving(null);
    if (error) return toast.error(error.message); toast.success(`Marked ${status}`); loadAffiliate();
  };

  const setFreeClaimStatus = async (id: string, status: "rejected") => {
    setAffSaving(id);
    const { error } = await supabase.from("affiliate_free_accounts").update({ status } as never).eq("id", id);
    setAffSaving(null);
    if (error) return toast.error(error.message); toast.success(`Marked ${status}`); loadAffiliate();
  };

  const openDeliverClaim = (claim: any) => { setDeliverClaimFor(claim); setClaimForm({ login: "", password: "", investor: "", server: "" }); };

  const submitDeliverClaim = async () => {
    if (!deliverClaimFor) return;
    if (!claimForm.login.trim() || !claimForm.password.trim() || !claimForm.server.trim()) { return toast.error("Login, password and server are required"); }
    setDeliveringClaim(true);
    const accountSize = Number(deliverClaimFor.account_size ?? 200000);
    const { data: chMatch } = await supabase.from("challenges").select("id").eq("account_size", accountSize).limit(1).maybeSingle();
    if (!chMatch) { setDeliveringClaim(false); return toast.error("No matching challenge found for this account size."); }
    const { error } = await supabase.from("affiliate_free_accounts").update({ status: "fulfilled", mt5_login: claimForm.login.trim(), mt5_password: claimForm.password.trim(), investor_password: claimForm.investor.trim() || null, mt5_server: claimForm.server.trim(), fulfilled_at: new Date().toISOString() } as never).eq("id", deliverClaimFor.id);
    if (error) { setDeliveringClaim(false); return toast.error(error.message); }
    const { error: taError } = await (supabase as any).from("trader_accounts").insert({ user_id: deliverClaimFor.affiliate_id, challenge_id: chMatch.id, order_id: null, mt5_login: claimForm.login.trim(), mt5_password: claimForm.password.trim(), investor_password: claimForm.investor.trim() || null, mt5_server: claimForm.server.trim(), starting_balance: accountSize, current_equity: accountSize, current_phase: 1, status: "active", provider: "exness-bot" });
    setDeliveringClaim(false);
    if (taError) return toast.error(taError.message);
    toast.success(`Delivered free account: login ${claimForm.login}`); setDeliverClaimFor(null); loadAffiliate(); load();
  };

  const saveTelegram = async () => {
    setTgSaving(true);
    const rows = [{ key: "telegram_bot_token", value: tgBotToken.trim() }, { key: "telegram_chat_id", value: tgChatId.trim() }];
    const { error } = await supabase.from("app_config").upsert(rows as never, { onConflict: "key" });
    setTgSaving(false);
    if (error) return toast.error(error.message); toast.success("Telegram settings saved");
  };

  const testTelegram = async () => {
    setTgTesting(true);
    const { error } = await supabase.rpc("send_telegram", { p_message: "✅ <b>FundedNG admin test</b>\nTelegram notifications are wired up." });
    setTgTesting(false);
    if (error) return toast.error(error.message); toast.success("Test message sent — check your Telegram");
  };

  return {
    session, user, profile,
    stats, unprovisionedOrders, payouts, accounts, pendingRequests,
    delivering, deliverFor, form, setDeliverFor, setForm, openDeliver, submitDelivery, deleteRequest,
    tickets, selectedTicket, ticketMessages, replyText, replySaving, statusFilter, statusUpdating,
    setReplyText, setStatusFilter, selectTicket, closeTicketDetail, sendAdminReply, updateTicketStatus, statusFlow,
    affPayouts, freeClaims, affSaving, affiliateStats, affiliateSummary,
    setAffPayoutStatus, setFreeClaimStatus, openDeliverClaim, submitDeliverClaim,
    deliverClaimFor, claimForm, deliveringClaim, setDeliverClaimFor, setClaimForm,
    partners, partnerPayouts, partnerSaving, newPartnerEmail, newPartnerRate, newPartnerChallengeId, newPartnerPromoCode, addingPartner,
    editingPartner, editRateValue, editChallengeId, editPromoCode, partnerFreeAccounts, setEditingPartner, setEditRateValue,
    setEditChallengeId, setEditPromoCode, setNewPartnerEmail, setNewPartnerRate, setNewPartnerChallengeId, setNewPartnerPromoCode, addPartner, saveCommissionRate, togglePartnerActive, deletePartner,
    setPartnerPayoutStatus, deliverPartnerFreeFor, partnerFreeForm, deliveringPartnerFree,
    setDeliverPartnerFreeFor, setPartnerFreeForm, openDeliverPartnerFree, submitDeliverPartnerFree,
    discountCodes, discountForm, discountSaving, setDiscountForm, saveDiscountCode, toggleDiscountActive,
    tgBotToken, tgChatId, tgSaving, tgTesting, setTgBotToken, setTgChatId, saveTelegram, testTelegram,
    equityDraft, equitySaving, setEquityDraft, submitEquity,
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
    openRejectDialog, submitRejectPhase,
    payoutRejectTarget, payoutRejectReason, payoutRejecting,
    setPayoutRejectTarget, setPayoutRejectReason, openPayoutRejectDialog, submitPayoutReject,
    poolAccounts, poolInventory, poolLoading, poolFormOpen, poolSaving, poolForm, viewCredsFor,
    setPoolFormOpen, setPoolForm, setPoolSaving, setViewCredsFor, loadPool,
    socialItems, uploadFile, uploadPreview, uploadLabel, uploadCategory, uploadOrder, uploading,
    savingSocialOrder, socialDeleting, setUploadFile, setUploadPreview, setUploadLabel,
    setUploadCategory, setUploadOrder, setUploading, loadSocialItems,
    challengeList, challengeEditOpen, editingChallenge, challengeForm, savingChallenge,
    openNewChallenge, openEditChallenge, saveChallenge, toggleChallengeActive, deleteChallenge, deletingChallengeId, setDeletingChallengeId, setChallengeEditOpen, setChallengeForm,
    load, loadChallenges, loadTickets, loadAffiliate, loadPartners, loadDiscounts,
    updatePayout, updateAccount, resetAccountBalance, approvePhase2, approveFunded,
  };
}

const AdminDataContext = createContext<ReturnType<typeof useAdminDataHook> | null>(null);

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const data = useAdminDataHook();
  return <AdminDataContext.Provider value={data}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error("useAdminData must be used within an AdminDataProvider");
  return ctx;
}
