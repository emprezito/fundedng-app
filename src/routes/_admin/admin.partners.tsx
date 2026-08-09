import { createFileRoute } from "@tanstack/react-router";
import { useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNaira, formatUSD } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_admin/admin/partners")({
  component: PartnersPage,
});

function PartnersPage() {
  const {
    partners, partnerPayouts, partnerSaving, newPartnerEmail, newPartnerRate, newPartnerChallengeId, newPartnerPromoCode, addingPartner,
    editingPartner, editRateValue, editChallengeId, editPromoCode, partnerFreeAccounts, deliverPartnerFreeFor, partnerFreeForm, deliveringPartnerFree,
    setEditingPartner, setEditRateValue, setEditChallengeId, setEditPromoCode, setNewPartnerEmail, setNewPartnerRate, setNewPartnerChallengeId, setNewPartnerPromoCode,
    addPartner, saveCommissionRate, togglePartnerActive, deletePartner, setPartnerPayoutStatus,
    setDeliverPartnerFreeFor, setPartnerFreeForm, openDeliverPartnerFree, submitDeliverPartnerFree,
    challengeList, loadPartners,
  } = useAdminData();

  return (
    <div className="mt-6 space-y-6">
      <h2 className="font-display text-xl font-bold">Partner Management</h2>

      {/* Add new partner */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-display text-base font-bold">Assign Partner Role</div>
        <p className="mt-1 text-xs text-muted-foreground">Enter the user's email and commission rate. Promo code is auto-generated from their name if left blank.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,140px,200px,160px,auto]">
          <Input placeholder="user@example.com" value={newPartnerEmail} onChange={(e) => setNewPartnerEmail(e.target.value)} />
          <Input type="number" min={0} max={100} step={0.5} placeholder="Rate %" value={newPartnerRate} onChange={(e) => setNewPartnerRate(e.target.value)} />
          <Select value={newPartnerChallengeId} onValueChange={setNewPartnerChallengeId}>
            <SelectTrigger><SelectValue placeholder="Free account" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No free account</SelectItem>
              {challengeList.filter((c: any) => c.is_active).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name} ({(c.currency === "USD" ? formatUSD : formatNaira)(c.account_size)})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Promo code (optional)" value={newPartnerPromoCode} onChange={(e) => setNewPartnerPromoCode(e.target.value)} />
          <Button onClick={addPartner} disabled={addingPartner}>{addingPartner ? "Adding…" : "Add Partner"}</Button>
        </div>
      </div>

      {/* Partners list */}
      <div>
        <div className="font-display mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">All Partners</div>
        {partners.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No partners yet.</div>
        ) : (
          <div className="space-y-2">
            {partners.map((p) => {
              const pendingForThis = partnerPayouts.filter((pp) => pp.partner_id === p.user_id && pp.status === "pending").length;
              const balance = Math.max(0, Number(p.total_earned_naira ?? 0) - Number(p.total_paid_naira ?? 0));
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display font-semibold">{p.profiles?.full_name ?? "—"}<span className="ml-2 font-mono text-xs text-primary">{p.promo_code}</span></div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Commission: <span className="font-bold text-foreground">{p.commission_rate}%</span> ·
                        Earned: <span className="font-bold text-foreground">{formatNaira(p.total_earned_naira)}</span> ·
                        Paid: {formatNaira(p.total_paid_naira)} ·
                        Available: <span className="font-bold text-foreground">{formatNaira(balance)}</span>
                        {pendingForThis > 0 && <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] text-warning">{pendingForThis} pending payout</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground/70">
                        Free account: {p.free_challenge ? <span className="font-medium text-foreground/80">{p.free_challenge.name} ({(p.free_challenge.currency === "USD" ? formatUSD : formatNaira)(p.free_challenge.account_size)})</span> : <span className="italic">None</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingPartner(p); setEditRateValue(String(p.commission_rate)); setEditChallengeId(p.free_account_challenge_id ?? ""); setEditPromoCode(p.promo_code ?? ""); }}>Edit</Button>
                      <Button size="sm" variant={p.is_active ? "outline" : "default"} onClick={() => togglePartnerActive(p)} disabled={partnerSaving === p.id}>{p.is_active ? "Deactivate" : "Activate"}</Button>
                      <Button size="sm" variant="destructive" onClick={() => deletePartner(p)} disabled={partnerSaving === p.id}>Delete</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Partner free-account requests */}
      <div>
        <div className="font-display mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Partner Free Account Requests</div>
        {partnerFreeAccounts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No partner free-account requests yet.</div>
        ) : (
          <div className="space-y-2">
            {partnerFreeAccounts.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{c.profiles?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Free {c.challenges ? <>{c.challenges.name} ({(c.challenges.currency === "USD" ? formatUSD : formatNaira)(c.challenges.account_size)})</> : <>{c.challenge_name ?? "Challenge"} ({formatNaira(c.account_size)})</>} · Requested {new Date(c.requested_at).toLocaleString()}{c.mt5_login && <> · Login <span className="font-mono">{c.mt5_login}</span></>}</div>
                  </div>
                  <Badge variant="outline" className="capitalize">{c.status}</Badge>
                </div>
                {c.status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => openDeliverPartnerFree(c)} disabled={partnerSaving === c.id}>Deliver account</Button>
                    <Button size="sm" variant="outline" onClick={async () => { setPartnerSaving(c.id); const { error } = await (supabase as any).from("partner_free_accounts").update({ status: "rejected" }).eq("id", c.id); setPartnerSaving(null); if (error) toast.error(error.message); else { toast.success("Rejected"); loadPartners(); } }} disabled={partnerSaving === c.id}>Reject</Button>
                  </div>
                )}
                {c.status === "fulfilled" && c.challenges && (
                  <div className="mt-3 text-xs text-muted-foreground">Delivered: <span className="font-mono">{c.mt5_login}</span> on {c.mt5_server} · Phase {c.challenges.phases}-step · Target {c.challenges.profit_target_percent}% · Max DD {c.challenges.max_drawdown_percent}%</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Partner payout requests */}
      <div>
        <div className="font-display mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Partner Payout Requests</div>
        {partnerPayouts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No payout requests yet.</div>
        ) : (
          <div className="space-y-2">
            {partnerPayouts.map((pp) => {
              const bd = (pp.bank_details ?? {}) as any;
              return (
                <div key={pp.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{pp.profiles?.full_name ?? "—"} · {formatNaira(pp.amount_naira)}</div>
                      <div className="text-xs text-muted-foreground">Requested {new Date(pp.requested_at).toLocaleString()}</div>
                      {bd.account_number && <div className="mt-1 text-xs text-muted-foreground">{bd.bank_name} · {bd.account_number} · {bd.account_name}</div>}
                    </div>
                    <Badge variant="outline" className="capitalize">{pp.status}</Badge>
                  </div>
                  {pp.status === "pending" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setPartnerPayoutStatus(pp.id, "approved")} disabled={partnerSaving === pp.id}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setPartnerPayoutStatus(pp.id, "paid")} disabled={partnerSaving === pp.id}>Mark Paid</Button>
                      <Button size="sm" variant="destructive" onClick={() => setPartnerPayoutStatus(pp.id, "rejected")} disabled={partnerSaving === pp.id}>Reject</Button>
                    </div>
                  )}
                  {pp.status === "approved" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setPartnerPayoutStatus(pp.id, "paid")} disabled={partnerSaving === pp.id}>Mark Paid</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit partner commission rate dialog */}
      <Dialog open={!!editingPartner} onOpenChange={(o) => { if (!o) setEditingPartner(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Partner</DialogTitle>
            <DialogDescription>{editingPartner?.profiles?.full_name} · {editingPartner?.promo_code}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-rate">Commission %</Label>
            <Input id="edit-rate" type="number" min={0} max={100} step={0.5} value={editRateValue} onChange={(e) => setEditRateValue(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-promo">Promo Code</Label>
            <Input id="edit-promo" value={editPromoCode} onChange={(e) => setEditPromoCode(e.target.value)} placeholder="e.g. JOHN4F3A" />
          </div>
          <div className="grid gap-1.5">
            <Label>Free Account Challenge</Label>
              <Select value={editChallengeId || "__none__"} onValueChange={(v) => setEditChallengeId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select free account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No free account</SelectItem>
                  {challengeList.filter((c: any) => c.is_active).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({(c.currency === "USD" ? formatUSD : formatNaira)(c.account_size)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPartner(null)}>Cancel</Button>
            <Button onClick={saveCommissionRate} disabled={!!partnerSaving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deliver partner free account dialog */}
      <Dialog open={!!deliverPartnerFreeFor} onOpenChange={(o) => !o && setDeliverPartnerFreeFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deliver free partner account</DialogTitle>
            <DialogDescription>{deliverPartnerFreeFor && <>Partner: <span className="font-medium">{deliverPartnerFreeFor.profiles?.full_name ?? "—"}</span> · Free {(() => { const ch = deliverPartnerFreeFor.challenges; return ch ? <>{ch.name} ({(ch.currency === "USD" ? formatUSD : formatNaira)(ch.account_size)})</> : <>{(deliverPartnerFreeFor as any).challenge_name ?? "Challenge"} ({(deliverPartnerFreeFor as any).account_size ? formatNaira((deliverPartnerFreeFor as any).account_size) : "—"})</> })}</>}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="partner-free-login">MT5 Login</Label><Input id="partner-free-login" value={partnerFreeForm.login} onChange={(e) => setPartnerFreeForm({ ...partnerFreeForm, login: e.target.value })} placeholder="e.g. 12345678" /></div>
            <div className="grid gap-1.5"><Label htmlFor="partner-free-server">Server</Label><Input id="partner-free-server" value={partnerFreeForm.server} onChange={(e) => setPartnerFreeForm({ ...partnerFreeForm, server: e.target.value })} placeholder="e.g. Exness-MT5Demo" /></div>
            <div className="grid gap-1.5"><Label htmlFor="partner-free-password">Master password</Label><Input id="partner-free-password" value={partnerFreeForm.password} onChange={(e) => setPartnerFreeForm({ ...partnerFreeForm, password: e.target.value })} placeholder="Trading password" /></div>
            <div className="grid gap-1.5"><Label htmlFor="partner-free-investor">Investor password (optional)</Label><Input id="partner-free-investor" value={partnerFreeForm.investor} onChange={(e) => setPartnerFreeForm({ ...partnerFreeForm, investor: e.target.value })} placeholder="Read-only password" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverPartnerFreeFor(null)} disabled={deliveringPartnerFree}>Cancel</Button>
            <Button onClick={submitDeliverPartnerFree} disabled={deliveringPartnerFree}>{deliveringPartnerFree ? "Delivering…" : "Deliver to partner"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
