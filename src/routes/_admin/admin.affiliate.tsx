import { createFileRoute } from "@tanstack/react-router";
import { useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNaira } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_admin/admin/affiliate")({
  component: AffiliatePage,
});

function AffiliatePage() {
  const {
    affiliateStats, affiliateSummary, affPayouts, freeClaims, affSaving, tgBotToken, tgChatId, tgSaving, tgTesting,
    setAffPayoutStatus, setFreeClaimStatus, openDeliverClaim, submitDeliverClaim,
    deliverClaimFor, claimForm, deliveringClaim, setDeliverClaimFor, setClaimForm,
    setTgBotToken, setTgChatId, saveTelegram, testTelegram,
  } = useAdminData();

  return (
    <div className="mt-6 space-y-6">
      <h2 className="font-display text-xl font-bold">Affiliate Management</h2>

      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        {[
          ["Total Affiliates", affiliateSummary.total, ""],
          ["Total Referrals", affiliateSummary.referrals, ""],
          ["Total Earned (₦)", formatNaira(affiliateSummary.earned), "text-primary"],
          ["Total Paid (₦)", formatNaira(affiliateSummary.paid), "text-green-500"],
          ["Pending (₦)", formatNaira(affiliateSummary.pending), "text-warning"],
          ["Revenue Generated (₦)", formatNaira(affiliateSummary.revenue), "text-primary"],
        ].map(([l, v, c]: any) => (
          <div key={l} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] text-muted-foreground">{l}</div>
            <div className={`font-display mt-1 text-lg font-bold ${c ?? ""}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* All Affiliates list */}
      <div>
        <h3 className="font-display text-lg font-bold">All Affiliates</h3>
        {affiliateStats.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No affiliates yet.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {affiliateStats.map((a: any) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <div className="font-semibold">{a.profile?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Code: <span className="font-mono text-primary">{a.code}</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
                    <div><span className="text-muted-foreground">Refs: </span><span className="font-display">{a.referralCount}</span>{a.paidReferralCount > 0 && <span className="text-muted-foreground/60"> ({a.paidReferralCount} paid)</span>}</div>
                    <div><span className="text-muted-foreground">Earned: </span><span className="font-display text-primary">{formatNaira(Number(a.total_earned_naira))}</span></div>
                    <div><span className="text-muted-foreground">Paid: </span><span className="font-display text-green-500">{formatNaira(Number(a.total_paid_naira))}</span></div>
                    <div><span className="text-muted-foreground">Pending: </span><span className={`font-display ${a.pendingCommissions > 0 ? "text-warning" : ""}`}>{formatNaira(a.pendingCommissions)}</span></div>
                    <div><span className="text-muted-foreground">Revenue: </span><span className="font-display text-primary">{formatNaira(a.totalRevenue)}</span></div>
                    <div><span className="text-muted-foreground">Acct Size: </span><span className="font-display">{formatNaira(a.totalAccountSize)}</span></div>
                    <div><span className="text-muted-foreground">Free Accts: </span><span className="font-display">{a.free_accounts_credited} credited / {a.free_accounts_claimed} claimed</span></div>
                    <div><span className="text-muted-foreground">Orders: </span><span className="font-display">{a.ordersCount}</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payout Requests */}
      <div>
        <h3 className="font-display text-lg font-bold">Payout Requests</h3>
        <div className="mt-3 space-y-3">
          {affPayouts.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No affiliate payout requests yet.</div>
          ) : affPayouts.map((p) => {
            const bd = p.bank_details ?? {};
            return (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{p.profiles?.full_name ?? "—"} · {formatNaira(p.amount_naira)}</div>
                    <div className="text-xs text-muted-foreground">Requested {new Date(p.requested_at).toLocaleString()}</div>
                    {bd.account_number && <div className="mt-1 text-xs text-muted-foreground">{bd.bank_name} · {bd.account_number} · {bd.account_name}</div>}
                  </div>
                  <Badge variant="outline" className="capitalize">{p.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.status === "pending" && <><Button size="sm" onClick={() => setAffPayoutStatus(p.id, "approved")} disabled={affSaving === p.id}>Approve</Button><Button size="sm" variant="outline" onClick={() => setAffPayoutStatus(p.id, "rejected")} disabled={affSaving === p.id}>Reject</Button></>}
                  {p.status === "approved" && <Button size="sm" onClick={() => setAffPayoutStatus(p.id, "paid")} disabled={affSaving === p.id}>Mark as paid</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Free Account Claims */}
      <div>
        <h3 className="font-display text-lg font-bold">Free Account Claims</h3>
        <div className="mt-3 space-y-3">
          {freeClaims.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No free-account claims yet.</div>
          ) : freeClaims.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{c.profiles?.full_name ?? "—"} · Free {formatNaira(c.account_size)} challenge</div>
                  <div className="text-xs text-muted-foreground">Batch #{c.referral_batch} · Claimed {new Date(c.created_at).toLocaleString()}{c.mt5_login && <> · Login <span className="font-mono">{c.mt5_login}</span></>}</div>
                </div>
                <Badge variant="outline" className="capitalize">{c.status}</Badge>
              </div>
              {c.status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openDeliverClaim(c)} disabled={affSaving === c.id}>Deliver account</Button>
                  <Button size="sm" variant="outline" onClick={() => setFreeClaimStatus(c.id, "rejected")} disabled={affSaving === c.id}>Reject</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Telegram Settings */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-display text-lg font-bold">Telegram Admin Notifications</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Get realtime pings for new orders, payout requests, free-account claims, support tickets and account-delivery requests.
          Create a bot via <a className="text-primary underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>,
          then send your bot a message and find your <span className="font-mono">chat_id</span> at{" "}
          <a className="text-primary underline" href="https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates" target="_blank" rel="noreferrer">api.telegram.org</a>.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="tg-token">Bot token</Label><Input id="tg-token" type="password" value={tgBotToken} onChange={(e) => setTgBotToken(e.target.value)} placeholder="123456:ABC..." /></div>
          <div className="grid gap-1.5"><Label htmlFor="tg-chat">Chat ID</Label><Input id="tg-chat" value={tgChatId} onChange={(e) => setTgChatId(e.target.value)} placeholder="e.g. 123456789 or -100123..." /></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={saveTelegram} disabled={tgSaving}>{tgSaving ? "Saving…" : "Save settings"}</Button>
          <Button variant="outline" onClick={testTelegram} disabled={tgTesting || !tgBotToken || !tgChatId}>{tgTesting ? "Sending…" : "Send test message"}</Button>
        </div>
      </div>

      {/* Deliver claim dialog */}
      <Dialog open={!!deliverClaimFor} onOpenChange={(o) => !o && setDeliverClaimFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deliver free affiliate account</DialogTitle>
            <DialogDescription>{deliverClaimFor && <>Affiliate: <span className="font-medium">{deliverClaimFor.profiles?.full_name ?? "—"}</span> · Free {formatNaira(deliverClaimFor.account_size ?? 200000)} challenge (batch #{deliverClaimFor.referral_batch})</>}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="claim-login">MT5 Login</Label><Input id="claim-login" value={claimForm.login} onChange={(e) => setClaimForm({ ...claimForm, login: e.target.value })} placeholder="e.g. 12345678" /></div>
            <div className="grid gap-1.5"><Label htmlFor="claim-server">Server</Label><Input id="claim-server" value={claimForm.server} onChange={(e) => setClaimForm({ ...claimForm, server: e.target.value })} placeholder="e.g. Exness-MT5Demo" /></div>
            <div className="grid gap-1.5"><Label htmlFor="claim-password">Master password</Label><Input id="claim-password" value={claimForm.password} onChange={(e) => setClaimForm({ ...claimForm, password: e.target.value })} placeholder="Trading password" /></div>
            <div className="grid gap-1.5"><Label htmlFor="claim-investor">Investor password (optional)</Label><Input id="claim-investor" value={claimForm.investor} onChange={(e) => setClaimForm({ ...claimForm, investor: e.target.value })} placeholder="Read-only password" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverClaimFor(null)} disabled={deliveringClaim}>Cancel</Button>
            <Button onClick={submitDeliverClaim} disabled={deliveringClaim}>{deliveringClaim ? "Delivering…" : "Deliver to affiliate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
