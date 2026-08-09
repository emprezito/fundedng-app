import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, ChevronRight } from "lucide-react";
import { addSocialProofServer, updateSocialProofServer, deleteSocialProofServer, addManualActivityServer, advanceManualPhaseServer, addManualLeaderboardServer, deleteManualLeaderboardServer } from "@/server/admin.functions";
import { CertificateCard, type Certificate } from "@/components/certificates/CertificateCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_admin/admin/social")({
  component: SocialPage,
});

interface ManualTrader {
  name: string;
  challenge_name: string;
  account_size: number;
  mt5_login: string;
  current_phase: number;
  latest_activity_id: string;
  cert: Certificate | null;
}

function SocialPage() {
  const {
    socialItems, uploadFile, uploadPreview, uploadLabel, uploadCategory, uploadOrder, uploading,
    savingSocialOrder, socialDeleting,
    setUploadFile, setUploadPreview, setUploadLabel, setUploadCategory, setUploadOrder,
    setUploading, loadSocialItems,
  } = useAdminData();

  const [mtTraderName, setMtTraderName] = useState("");
  const [mtAccountSize, setMtAccountSize] = useState("");
  const [mtChallengeName, setMtChallengeName] = useState("Standard");
  const [mtMt5Login, setMtMt5Login] = useState("");
  const [mtEventType, setMtEventType] = useState<string>("phase1_to_phase2");
  const [mtPayoutAmount, setMtPayoutAmount] = useState("");
  const [mtSaving, setMtSaving] = useState(false);

  const [manualTraders, setManualTraders] = useState<ManualTrader[]>([]);
  const [manualLoading, setManualLoading] = useState(true);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [certTarget, setCertTarget] = useState<Certificate | null>(null);

  const [lbTraderName, setLbTraderName] = useState("");
  const [lbChallengeName, setLbChallengeName] = useState("Standard");
  const [lbAccountSize, setLbAccountSize] = useState("");
  const [lbProfitPercent, setLbProfitPercent] = useState("");
  const [lbSaving, setLbSaving] = useState(false);
  const [manualLeaderboard, setManualLeaderboard] = useState<any[]>([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [lbDeleting, setLbDeleting] = useState<string | null>(null);

  const loadManualTraders = async () => {
    setManualLoading(true);
    try {
      const { data } = await supabase
        .from("live_activity")
        .select("*")
        .in("event_type", ["phase1_to_phase2", "phase2_to_funded", "payout_approved"])
        .order("created_at", { ascending: false });

      if (!data) { setManualTraders([]); return; }

      // Group by trader name, keep latest entry per trader
      const byName = new Map<string, any>();
      for (const row of data) {
        const existing = byName.get(row.anonymized_name);
        if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
          byName.set(row.anonymized_name, row);
        }
      }

      const traders: ManualTrader[] = Array.from(byName.values()).map((row: any) => {
        const meta = row.metadata ?? {};
        return {
          name: row.anonymized_name,
          challenge_name: row.challenge_name,
          account_size: Number(row.account_size ?? 0),
          mt5_login: meta.mt5_login ?? "",
          current_phase: meta.current_phase ?? 1,
          latest_activity_id: row.id,
          cert: meta.certificate_number ? {
            id: row.id,
            kind: meta.kind ?? "funded",
            certificate_number: meta.certificate_number,
            full_name: meta.full_name ?? row.anonymized_name,
            account_size: meta.account_size ?? Number(row.account_size ?? 0),
            challenge_name: meta.challenge_name ?? row.challenge_name,
            mt5_login: meta.mt5_login ?? "N/A",
            payout_amount: meta.payout_amount ?? null,
            issued_at: meta.issued_at ?? row.created_at,
          } : null,
        };
      });

      traders.sort((a, b) => b.account_size - a.account_size);
      setManualTraders(traders);
    } catch {
      setManualTraders([]);
    } finally {
      setManualLoading(false);
    }
  };

  useEffect(() => { loadManualTraders(); }, []);

  const loadManualLeaderboard = async () => {
    setLbLoading(true);
    try {
      const { data } = await supabase
        .from("manual_leaderboard")
        .select("*")
        .order("profit_amount", { ascending: false });
      setManualLeaderboard(data ?? []);
    } catch {
      setManualLeaderboard([]);
    } finally {
      setLbLoading(false);
    }
  };

  useEffect(() => { loadManualLeaderboard(); }, []);

  const handleLogActivity = async () => {
    if (!mtTraderName.trim()) return toast.error("Enter trader name");
    if (!mtAccountSize || Number(mtAccountSize) <= 0) return toast.error("Enter a valid account size");
    if (mtEventType === "payout_approved" && (!mtPayoutAmount || Number(mtPayoutAmount) <= 0)) {
      return toast.error("Enter payout amount");
    }
    setMtSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return toast.error("Please sign in again");
      const result = await addManualActivityServer({
        data: {
          accessToken: session.access_token,
          traderName: mtTraderName.trim(),
          accountSize: Number(mtAccountSize),
          challengeName: mtChallengeName.trim() || "Standard",
          mt5Login: mtMt5Login.trim(),
          eventType: mtEventType as "phase1_to_phase2" | "phase2_to_funded" | "payout_approved",
          payoutAmount: mtEventType === "payout_approved" ? Number(mtPayoutAmount) : undefined,
        },
      });
      if (!result?.ok) return toast.error(result?.error ?? "Failed");
      toast.success("Activity logged");
      setMtTraderName("");
      setMtAccountSize("");
      setMtPayoutAmount("");
      setMtMt5Login("");
      loadManualTraders();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setMtSaving(false);
    }
  };

  const handleAdvancePhase = async (trader: ManualTrader) => {
    if (trader.current_phase >= 3) return;
    setAdvancingId(trader.latest_activity_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return toast.error("Please sign in again");
      const result = await advanceManualPhaseServer({
        data: { accessToken: session.access_token, activityId: trader.latest_activity_id },
      });
      if (!result?.ok) return toast.error(result?.error ?? "Failed");
      toast.success("Phase advanced");
      loadManualTraders();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setAdvancingId(null);
    }
  };

  const handleAddLeaderboard = async () => {
    if (!lbTraderName.trim()) return toast.error("Enter trader name");
    if (!lbAccountSize || Number(lbAccountSize) <= 0) return toast.error("Enter a valid account size");
    if (!lbProfitPercent && lbProfitPercent !== "0") return toast.error("Enter profit %");
    setLbSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return toast.error("Please sign in again");
      const result = await addManualLeaderboardServer({
        data: {
          accessToken: session.access_token,
          traderName: lbTraderName.trim(),
          challengeName: lbChallengeName.trim() || "Standard",
          accountSize: Number(lbAccountSize),
          profitPercent: Number(lbProfitPercent),
        },
      });
      if (!result?.ok) return toast.error(result?.error ?? "Failed");
      toast.success("Added to leaderboard");
      setLbTraderName("");
      setLbChallengeName("Standard");
      setLbAccountSize("");
      setLbProfitPercent("");
      loadManualLeaderboard();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setLbSaving(false);
    }
  };

  const handleDeleteLeaderboard = async (id: string) => {
    setLbDeleting(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return toast.error("Please sign in again");
      const result = await deleteManualLeaderboardServer({
        data: { accessToken: session.access_token, id },
      });
      if (!result?.ok) return toast.error(result?.error ?? "Failed");
      toast.success("Removed from leaderboard");
      loadManualLeaderboard();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setLbDeleting(null);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <h2 className="font-display text-xl font-bold">Social Proof & Activity</h2>

      {/* ── Manual Activity Logger ──────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-display text-base font-bold">Log Trader Activity</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Log a trader milestone. Appears on the leaderboard. Use "Approve Next Phase" to advance them.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="mt-name">Trader Name</Label>
            <Input id="mt-name" value={mtTraderName} onChange={(e) => setMtTraderName(e.target.value)} placeholder="e.g. Adebayo O." />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mt-size">Account Size (₦)</Label>
            <Input id="mt-size" type="number" min={0} value={mtAccountSize} onChange={(e) => setMtAccountSize(e.target.value)} placeholder="e.g. 200000" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mt-challenge">Challenge Name</Label>
            <Input id="mt-challenge" value={mtChallengeName} onChange={(e) => setMtChallengeName(e.target.value)} placeholder="Standard" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mt5-login">MT5 Login</Label>
            <Input id="mt5-login" value={mtMt5Login} onChange={(e) => setMtMt5Login(e.target.value)} placeholder="e.g. 12345678" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mt-event">Event Type</Label>
            <Select value={mtEventType} onValueChange={setMtEventType}>
              <SelectTrigger id="mt-event"><SelectValue placeholder="Select event" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="phase1_to_phase2">Phase 1 → Phase 2 Approval</SelectItem>
                <SelectItem value="phase2_to_funded">Phase 2 → Funded Approval</SelectItem>
                <SelectItem value="payout_approved">Payout Approval</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mtEventType === "payout_approved" && (
            <div className="grid gap-1.5">
              <Label htmlFor="mt-payout">Payout Amount (₦)</Label>
              <Input id="mt-payout" type="number" min={0} value={mtPayoutAmount} onChange={(e) => setMtPayoutAmount(e.target.value)} placeholder="e.g. 42000" />
            </div>
          )}
        </div>
        <Button className="mt-4" onClick={handleLogActivity} disabled={mtSaving}>
          {mtSaving ? "Saving…" : "Log Activity"}
        </Button>
      </div>

      {/* ── Logged Traders List ──────────────────────────────────── */}
      <div>
        <h3 className="font-display text-lg font-bold">Logged Traders</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          All traders with manually logged activity. Approve next phase or download certificates.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trader Name</TableHead>
                <TableHead>Challenge</TableHead>
                <TableHead>MT5 Login</TableHead>
                <TableHead className="w-24">Account Size</TableHead>
                <TableHead className="w-24">Phase</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manualLoading ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : manualTraders.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No traders logged yet.</TableCell></TableRow>
              ) : manualTraders.map((trader) => (
                <TableRow key={trader.name}>
                  <TableCell className="font-semibold">{trader.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{trader.challenge_name}</TableCell>
                  <TableCell className="font-mono text-xs">{trader.mt5_login || "—"}</TableCell>
                  <TableCell className="font-display text-sm">
                    ₦{trader.account_size.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-display ${
                      trader.current_phase === 3
                        ? "border-green-500/50 text-green-500"
                        : "border-blue-500/50 text-blue-500"
                    }`}>
                      {trader.current_phase === 3 ? "Funded" : `Phase ${trader.current_phase}`}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {trader.current_phase < 3 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={advancingId === trader.latest_activity_id}
                          onClick={() => handleAdvancePhase(trader)}
                        >
                          {advancingId === trader.latest_activity_id ? "…" : (
                            <>Approve <ChevronRight className="ml-0.5 h-3 w-3" /></>
                          )}
                        </Button>
                      )}
                      {trader.cert && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setCertTarget(trader.cert)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Manual Leaderboard Entries ───────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-display text-base font-bold">Add to Leaderboard</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter the account size and profit % — profit amount and total are calculated automatically.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="lb-name">Trader Name</Label>
            <Input id="lb-name" value={lbTraderName} onChange={(e) => setLbTraderName(e.target.value)} placeholder="e.g. Adebayo O." />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lb-challenge">Challenge Name</Label>
            <Input id="lb-challenge" value={lbChallengeName} onChange={(e) => setLbChallengeName(e.target.value)} placeholder="Standard" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lb-account-size">Account Size (₦)</Label>
            <Input id="lb-account-size" type="number" min={0} value={lbAccountSize} onChange={(e) => setLbAccountSize(e.target.value)} placeholder="e.g. 200000" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lb-profit-percent">Profit %</Label>
            <Input id="lb-profit-percent" type="number" step="0.1" value={lbProfitPercent} onChange={(e) => setLbProfitPercent(e.target.value)} placeholder="e.g. 25" />
          </div>
        </div>
        {lbAccountSize && lbProfitPercent && Number(lbAccountSize) > 0 && (
          <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-xs text-muted-foreground mb-1">Calculated values</p>
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Profit Amount</p>
                <p className="font-display font-bold text-green-400">₦{Math.round(Number(lbAccountSize) * (Number(lbProfitPercent) / 100)).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Profit</p>
                <p className="font-display font-bold text-green-400">₦{Math.round(Number(lbAccountSize) * (Number(lbProfitPercent) / 100)).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
        <Button className="mt-4" onClick={handleAddLeaderboard} disabled={lbSaving}>
          {lbSaving ? "Adding…" : "Add to Leaderboard"}
        </Button>
      </div>

      {/* ── Manual Leaderboard Table ─────────────────────────────── */}
      <div>
        <h3 className="font-display text-lg font-bold">Leaderboard Entries</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Manually added leaderboard entries. These appear alongside automatic entries on the public leaderboard.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trader Name</TableHead>
                <TableHead>Challenge</TableHead>
                <TableHead className="w-28">Account Size</TableHead>
                <TableHead className="w-24">Profit %</TableHead>
                <TableHead className="w-32">Profit Amount</TableHead>
                <TableHead className="w-32">Total Profit</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lbLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : manualLeaderboard.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No manual entries yet.</TableCell></TableRow>
              ) : manualLeaderboard.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-semibold">{entry.trader_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.challenge_name}</TableCell>
                  <TableCell className="font-display text-sm">₦{Number(entry.account_size).toLocaleString()}</TableCell>
                  <TableCell className="font-display text-sm">{entry.profit_percent}%</TableCell>
                  <TableCell className="font-display text-sm text-green-500">₦{Number(entry.profit_amount).toLocaleString()}</TableCell>
                  <TableCell className="font-display text-sm text-green-500">₦{Number(entry.total_profit).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-destructive hover:bg-destructive/10"
                      disabled={lbDeleting === entry.id}
                      onClick={() => handleDeleteLeaderboard(entry.id)}
                    >
                      {lbDeleting === entry.id ? "…" : "Delete"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Certificate Dialog ───────────────────────────────────── */}
      <Dialog open={!!certTarget} onOpenChange={(o) => { if (!o) setCertTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{certTarget?.kind === "payout" ? "Payout" : "Funded"} Certificate</DialogTitle>
            <DialogDescription>Preview and download the certificate.</DialogDescription>
          </DialogHeader>
          {certTarget && <CertificateCard cert={certTarget} />}
        </DialogContent>
      </Dialog>

      {/* ── Existing Image Upload Form ──────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-display text-base font-bold">Add New Image</div>
        <p className="mt-1 text-xs text-muted-foreground">Upload social proof images for the homepage gallery.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="sp-image">Image (JPG, PNG, WebP — max 5MB)</Label>
            <Input id="sp-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 5 * 1024 * 1024) { toast.error("File too large — max 5MB"); e.target.value = ""; return; }
                setUploadFile(file); setUploadPreview(URL.createObjectURL(file));
              }
            }} className="h-auto py-1.5 file:mr-3 file:h-7 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:text-xs file:font-medium file:text-primary" />
            {uploadPreview && <div className="mt-1 h-32 w-48 overflow-hidden rounded-lg border border-border"><img src={uploadPreview} alt="Preview" className="h-full w-full object-cover" /></div>}
          </div>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="sp-label">Label</Label><Input id="sp-label" value={uploadLabel} onChange={(e) => setUploadLabel(e.target.value)} placeholder="e.g. ₦42,000 Payout — Michael O." /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="sp-category">Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger id="sp-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payout">Payout</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="dashboard">Dashboard</SelectItem>
                  <SelectItem value="funded">Funded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="sp-order">Display Order</Label><Input id="sp-order" type="number" min={0} value={uploadOrder} onChange={(e) => setUploadOrder(e.target.value)} /></div>
          </div>
        </div>
        <Button className="mt-4" onClick={async () => {
          if (!uploadFile) return toast.error("Select an image");
          if (!uploadLabel.trim()) return toast.error("Enter a label");
          setUploading(true);
          try {
            const filePath = `${crypto.randomUUID()}-${uploadFile.name}`;
            const { error: uploadError } = await supabase.storage.from("social-proof").upload(filePath, uploadFile, { contentType: uploadFile.type, upsert: false });
            if (uploadError) { toast.error(uploadError.message); return; }
            const { data: { publicUrl } } = supabase.storage.from("social-proof").getPublicUrl(filePath);
            const { data: { session: uploadSession } } = await supabase.auth.getSession();
            const result = await addSocialProofServer({ data: { accessToken: uploadSession?.access_token ?? "", label: uploadLabel.trim(), image_url: publicUrl, storage_path: filePath, category: uploadCategory, display_order: Number(uploadOrder) } });
            if (!result.ok) { toast.error(result.error); return; }
            toast.success("Image added to gallery");
            setUploadFile(null); setUploadPreview(""); setUploadLabel(""); setUploadCategory("payout"); setUploadOrder("0");
            loadSocialItems();
          } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
          finally { setUploading(false); }
        }} disabled={uploading}>{uploading ? "Uploading…" : "Upload & Add to Gallery"}</Button>
      </div>

      {/* ── Gallery Management Table ─────────────────────────────── */}
      <div>
        <h3 className="font-display text-lg font-bold">Gallery Items</h3>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Preview</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-20">Order</TableHead>
                <TableHead className="w-20">Visible</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {socialItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No items yet. Upload your first image above.</TableCell></TableRow>
              ) : socialItems.map((item) => {
                const catConfig: Record<string, string> = { payout: "bg-green-500/20 text-green-500 border-green-500/40", certificate: "bg-blue-500/20 text-blue-500 border-blue-500/40", dashboard: "bg-purple-500/20 text-purple-500 border-purple-500/40", funded: "bg-amber-500/20 text-amber-500 border-amber-500/40" };
                return (
                  <TableRow key={item.id}>
                    <TableCell><div className="h-12 w-20 overflow-hidden rounded-md border border-border"><img src={item.image_url} alt={item.label} className="h-full w-full object-cover" loading="lazy" /></div></TableCell>
                    <TableCell className="max-w-[240px] truncate font-medium">{item.label}</TableCell>
                    <TableCell><Badge variant="outline" className={`font-display ${catConfig[item.category] ?? ""}`}>{item.category?.toUpperCase() ?? "—"}</Badge></TableCell>
                    <TableCell>
                      <Input type="number" min={0} className="h-8 w-16 text-xs" defaultValue={item.display_order}
                        onBlur={async (e) => {
                          const val = e.target.value;
                          if (Number(val) !== item.display_order) {
                            const { data: { session: orderSess } } = await supabase.auth.getSession();
                            const result = await updateSocialProofServer({ data: { accessToken: orderSess?.access_token ?? "", id: item.id, display_order: Number(val) } });
                            if (!result.ok) return toast.error(result.error);
                            loadSocialItems();
                          }
                        }} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={!!item.is_visible} onCheckedChange={async () => {
                        const { data: { session: visSess } } = await supabase.auth.getSession();
                        const result = await updateSocialProofServer({ data: { accessToken: visSess?.access_token ?? "", id: item.id, is_visible: !item.is_visible } });
                        if (!result.ok) return toast.error(result.error);
                        toast.success(item.is_visible ? "Hidden" : "Visible"); loadSocialItems();
                      }} />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:bg-destructive/10" disabled={socialDeleting === item.id}
                        onClick={async () => {
                          if (!confirm(`Delete "${item.label}"?`)) return;
                          const { data: { session: delSess } } = await supabase.auth.getSession();
                          const result = await deleteSocialProofServer({ data: { accessToken: delSess?.access_token ?? "", id: item.id, storage_path: item.storage_path ?? undefined } });
                          if (!result.ok) return toast.error(result.error);
                          toast.success("Item deleted"); loadSocialItems();
                        }}>{socialDeleting === item.id ? "…" : "Delete"}</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
