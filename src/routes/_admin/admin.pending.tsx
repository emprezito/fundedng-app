import { createFileRoute } from "@tanstack/react-router";
import { useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNaira, formatUSD } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_admin/admin/pending")({
  component: PendingPage,
});

function PendingPage() {
  const { pendingRequests, deliverFor, form, delivering, setDeliverFor, setForm, openDeliver, submitDelivery, deleteRequest } = useAdminData();

  return (
    <div className="mt-6 space-y-3">
      <h2 className="font-display text-xl font-bold">Pending Account Delivery</h2>
      {pendingRequests.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No pending accounts. New paid orders will appear here for manual delivery.
        </div>
      ) : pendingRequests.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="font-semibold">{r.profiles?.full_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{r.challenges?.name} · {r.orders?.currency === "USD" ? formatUSD(r.challenges?.account_size ?? 0) : formatNaira(r.challenges?.account_size ?? 0)} {r.orders?.currency === "USD" && <Badge variant="outline" className="ml-1 border-blue-400/40 text-blue-500 text-[10px]">USD</Badge>}</div>
            </div>
            <Badge variant="outline" className={`font-display ${r.status === "failed" ? "border-destructive/40 text-destructive" : "border-warning/40 text-warning"}`}>
              {r.status.toUpperCase()}
            </Badge>
            <Button size="sm" onClick={() => openDeliver(r)}>Deliver manually</Button>
            <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => deleteRequest(r)}>
              Delete
            </Button>
          </div>
          {r.failure_reason && (
            <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {r.failure_reason}
            </div>
          )}
        </div>
      ))}

      <Dialog open={!!deliverFor} onOpenChange={(o) => !o && setDeliverFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deliver MT5 account</DialogTitle>
            <DialogDescription>
              {deliverFor && (
                <>Trader: <span className="font-medium">{deliverFor.profiles?.full_name ?? "—"}</span> · {deliverFor.challenges?.name} ({deliverFor.orders?.currency === "USD" ? formatUSD(deliverFor.challenges?.account_size ?? 0) : formatNaira(deliverFor.challenges?.account_size ?? 0)})</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="login">MT5 Login</Label>
              <Input id="login" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="e.g. 12345678" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="server">Server</Label>
              <Input id="server" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} placeholder="e.g. ICMarketsSC-Demo" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Master password</Label>
              <Input id="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Trading password" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="investor">Investor password (optional)</Label>
              <Input id="investor" value={form.investor} onChange={(e) => setForm({ ...form, investor: e.target.value })} placeholder="Read-only password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverFor(null)} disabled={delivering}>Cancel</Button>
            <Button onClick={submitDelivery} disabled={delivering}>{delivering ? "Delivering…" : "Deliver to trader"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
