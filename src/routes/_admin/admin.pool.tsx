import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNaira, formatUSD } from "@/lib/utils";
import { Plus, AlertTriangle, Eye, Archive, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_admin/admin/pool")({
  component: PoolPage,
});

function CountdownCell({ created_at, status }: { created_at: string; status: string }) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    const update = () => {
      if (status !== "available") { setDisplay(""); return; }
      const created = new Date(created_at).getTime();
      const expiry = created + 5 * 24 * 60 * 60 * 1000;
      const diff = expiry - Date.now();
      if (diff <= 0) { setDisplay("EXPIRED"); return; }
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      setDisplay(`${days}d ${hours}h ${mins}m`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [created_at, status]);

  if (!display) return null;
  return <div className={`text-[11px] ${display === "EXPIRED" ? "font-semibold text-red-500" : "text-muted-foreground"}`}>{display}</div>;
}

function PoolPage() {
  const {
    poolAccounts, poolInventory, poolLoading, poolFormOpen, poolSaving, poolForm, viewCredsFor, challengeList,
    setPoolFormOpen, setPoolForm, setPoolSaving, setViewCredsFor, loadPool,
  } = useAdminData();

  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleDeletePool = async (id: string) => {
    if (!confirm("Delete this account from the pool? This cannot be undone.")) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch("/api/admin/pool", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action: "delete", id }) });
    const json = await res.json();
    if (json.ok) { toast.success("Account deleted"); loadPool(); } else { toast.error(json.error ?? "Failed to delete"); }
  };

  return (
    <div className="mt-6 space-y-4">
      <h2 className="font-display text-xl font-bold">Account Pool</h2>

      {/* Low stock warning */}
      {(() => {
        const low: string[] = [];
        const phaseLabels = ["", "Phase 1", "Phase 2", "Funded"];
        for (const [key, phases] of Object.entries(poolInventory)) {
          for (const [phaseStr, count] of Object.entries(phases)) {
            const phase = Number(phaseStr);
            if (count < 3) {
              const isUsd = key.startsWith("usd_");
              const size = Number(key.replace(/^(usd|ngn)_/, ""));
              low.push(`${isUsd ? formatUSD(size) : formatNaira(size)} ${phaseLabels[phase]} (${count})`);
            }
          }
        }
        if (low.length === 0) return null;
        return (
          <Alert variant="default" className="border-warning/40 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning-foreground text-sm">
              <span className="font-display font-semibold">Low Stock:</span> {low.join(", ")}
            </AlertDescription>
          </Alert>
        );
      })()}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl font-bold">Inventory</h3>
        <Button size="sm" onClick={() => setPoolFormOpen(true)} className="font-display"><Plus className="mr-1 h-4 w-4" /> Add Account</Button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Challenge</TableHead>
                <TableHead className="text-center">Phase 1</TableHead>
                <TableHead className="text-center">Phase 2</TableHead>
                <TableHead className="text-center">Funded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {challengeList.filter((c: any) => c.is_active).map((c: any) => {
                const isUsd = c.currency === "USD";
                const invKey = isUsd ? `usd_${c.account_size}` : `ngn_${c.account_size}`;
                const phases = poolInventory[invKey] ?? {};
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{isUsd ? formatUSD(c.account_size) : formatNaira(c.account_size)}</div>
                    </TableCell>
                    {[1, 2, 3].map((phase) => {
                      const count = phases[phase] ?? 0;
                      const color = count >= 3 ? "text-green-500" : count >= 1 ? "text-amber-500" : "text-red-500";
                      return (
                        <TableCell key={phase} className="text-center">
                          <span className={`font-display text-lg font-bold ${color}`}>{count}</span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pool accounts table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>MT5 Login</TableHead><TableHead>Phase</TableHead><TableHead>Currency</TableHead><TableHead>Account Size</TableHead><TableHead>Server</TableHead>
                <TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Assigned</TableHead>
                <TableHead>Order</TableHead><TableHead>Notes</TableHead><TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {poolAccounts.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">{poolLoading ? "Loading…" : "No accounts in pool."}</TableCell></TableRow>
              )}
              {poolAccounts.map((a: any) => {
                const statusColor: Record<string, string> = { available: "text-green-500 border-green-500/40", assigned: "text-blue-500 border-blue-500/40", archived: "text-muted-foreground border-muted", flagged: "text-red-500 border-red-500/40" };
                const isUsd = a.currency === "USD";
                const phaseLabel = a.phase === 1 ? "Phase 1" : a.phase === 2 ? "Phase 2" : "Funded";
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.mt5_login}</TableCell>
                    <TableCell><Badge variant="outline" className="font-display text-[10px]">{phaseLabel}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={`font-display ${isUsd ? "border-blue-500/40 text-blue-500" : "border-green-500/40 text-green-500"}`}>{isUsd ? "USD" : "NGN"}</Badge></TableCell>
                    <TableCell>{isUsd ? formatUSD(a.account_size_usd) : formatNaira(a.account_size_ngn)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.mt5_server}</TableCell>
                    <TableCell><Badge variant="outline" className={`font-display ${statusColor[a.status] ?? ""}`}>{a.status.toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{new Date(a.created_at).toLocaleDateString()}</div>
                      <CountdownCell created_at={a.created_at} status={a.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.assigned_order_id ? a.assigned_order_id.slice(0, 8) + "…" : "—"}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground" title={a.notes ?? ""}>{a.notes ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => setViewCredsFor(a)}><Eye className="h-3.5 w-3.5" /></Button>
                        {a.status === "available" && (() => {
                          const created = new Date(a.created_at).getTime();
                          const expired = Date.now() >= created + 5 * 24 * 60 * 60 * 1000;
                          return expired ? (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDeletePool(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={async () => {
                              const { data: { session } } = await supabase.auth.getSession();
                              if (!session?.access_token) return;
                              const res = await fetch("/api/admin/pool", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action: "archive", id: a.id }) });
                              const json = await res.json();
                              if (json.ok) { toast.success("Account archived"); loadPool(); } else { toast.error(json.error ?? "Failed to archive"); }
                            }}><Archive className="h-3.5 w-3.5" /></Button>
                          );
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* View credentials dialog */}
      <Dialog open={!!viewCredsFor} onOpenChange={(o) => !o && setViewCredsFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>MT5 Credentials</DialogTitle>
            <DialogDescription>Login: <span className="font-mono font-medium text-foreground">{viewCredsFor?.mt5_login}</span></DialogDescription>
          </DialogHeader>
          {viewCredsFor && (
            <div className="grid gap-3">
              <div className="grid gap-1"><Label className="text-xs text-muted-foreground">Server</Label><div className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">{viewCredsFor.mt5_server}</div></div>
              <div className="grid gap-1"><Label className="text-xs text-muted-foreground">Master Password</Label><div className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">{viewCredsFor.mt5_password}</div></div>
              <div className="grid gap-1"><Label className="text-xs text-muted-foreground">Investor Password</Label><div className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">{viewCredsFor.investor_password}</div></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setViewCredsFor(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add account to pool dialog */}
      <Dialog open={poolFormOpen} onOpenChange={(o) => !poolSaving && !o && setPoolFormOpen(false)}>
        <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Add account to pool</DialogTitle>
            <DialogDescription>Enter the MT5 credentials for a demo account created in the broker terminal.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Pool Phase *</Label>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: "1", l: "Phase 1" }, { v: "2", l: "Phase 2" }, { v: "3", l: "Funded" }].map((opt) => (
                  <button key={opt.v} type="button" onClick={() => setPoolForm({ ...poolForm, phase: opt.v })}
                    className={`rounded-md border px-3 py-2 text-sm font-display ${poolForm.phase === opt.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{opt.l}</button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="pool-login">MT5 Login *</Label><Input id="pool-login" value={poolForm.mt5_login} onChange={(e) => setPoolForm({ ...poolForm, mt5_login: e.target.value })} placeholder="e.g. 12345678" /></div>
            <div className="grid gap-1.5"><Label htmlFor="pool-password">Master password *</Label><Input id="pool-password" value={poolForm.mt5_password} onChange={(e) => setPoolForm({ ...poolForm, mt5_password: e.target.value })} placeholder="Trading password" /></div>
            <div className="grid gap-1.5"><Label htmlFor="pool-investor">Investor password *</Label><Input id="pool-investor" value={poolForm.investor_password} onChange={(e) => setPoolForm({ ...poolForm, investor_password: e.target.value })} placeholder="Read-only password for VPS monitoring" /></div>
            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPoolForm({ ...poolForm, currency: "NGN", account_size_ngn: "", account_size_usd: "" })}
                  className={`rounded-md border px-3 py-2 text-sm font-display ${poolForm.currency !== "USD" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>NGN</button>
                <button type="button" onClick={() => setPoolForm({ ...poolForm, currency: "USD", account_size_ngn: "", account_size_usd: "" })}
                  className={`rounded-md border px-3 py-2 text-sm font-display ${poolForm.currency === "USD" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>USD</button>
              </div>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="pool-server">MT5 Server</Label><Input id="pool-server" value={poolForm.mt5_server} onChange={(e) => setPoolForm({ ...poolForm, mt5_server: e.target.value })} placeholder="Exness-MT5Trial9" /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="pool-size">Account Size *</Label>
              <Select value={poolForm.currency === "USD" ? poolForm.account_size_usd : poolForm.account_size_ngn} onValueChange={(v) => setPoolForm({ ...poolForm, [poolForm.currency === "USD" ? "account_size_usd" : "account_size_ngn"]: v })}>
                <SelectTrigger id="pool-size"><SelectValue placeholder="Select account size" /></SelectTrigger>
                <SelectContent>
                  {challengeList.filter((c: any) => c.is_active && c.currency === poolForm.currency).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.account_size)}>{c.name} — {c.currency === "USD" ? formatUSD(c.account_size) : formatNaira(c.account_size)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="pool-notes">Notes</Label><Input id="pool-notes" value={poolForm.notes} onChange={(e) => setPoolForm({ ...poolForm, notes: e.target.value })} placeholder="Optional admin notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPoolFormOpen(false); }} disabled={poolSaving}>Cancel</Button>
            <Button onClick={async () => {
              if (!poolForm.mt5_login.trim() || !poolForm.mt5_password.trim() || !poolForm.investor_password.trim()) { toast.error("Login, password, and investor password are required"); return; }
              if (poolForm.currency === "USD" && !poolForm.account_size_usd) { toast.error("Account size is required for USD accounts"); return; }
              if (poolForm.currency !== "USD" && !poolForm.account_size_ngn) { toast.error("Account size is required for NGN accounts"); return; }
              setPoolSaving(true);
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) return;
                const body: any = { action: "add", mt5_login: poolForm.mt5_login.trim(), mt5_password: poolForm.mt5_password.trim(), investor_password: poolForm.investor_password.trim(), mt5_server: poolForm.mt5_server.trim() || "Exness-MT5Trial9", currency: poolForm.currency, phase: Number(poolForm.phase), notes: poolForm.notes.trim() || null };
                if (poolForm.currency === "USD") body.account_size_usd = Number(poolForm.account_size_usd);
                else body.account_size_ngn = Number(poolForm.account_size_ngn);
                const res = await fetch("/api/admin/pool", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
                const json = await res.json();
                if (json.ok) { toast.success("Account added to pool"); setPoolForm({ mt5_login: "", mt5_password: "", investor_password: "", mt5_server: "Exness-MT5Trial9", account_size_ngn: "", account_size_usd: "", currency: "NGN", phase: "1", notes: "" }); setPoolFormOpen(false); loadPool(); }
                else { toast.error(json.error ?? "Failed to add account"); }
              } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setPoolSaving(false); }
            }} disabled={poolSaving}>{poolSaving ? "Adding…" : "Add to Pool"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
