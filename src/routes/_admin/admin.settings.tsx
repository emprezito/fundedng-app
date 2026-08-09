import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: SettingsPage,
});

const breachReasons = [
  {
    category: "Scalping",
    label: "Overlapping Trades (Instant Breach)",
    message: `Scalping violation: two short-held trades overlapped in time (e.g., {symbol} ticket #{ticket}). All trades must be held a minimum of 3 minutes (180s) regardless of close type.`,
  },
  {
    category: "Scalping",
    label: "4th Short-Held Trade",
    message: `Scalping violation: {symbol} trade closed in {duration_seconds}s. All trades must be held a minimum of 3 minutes (180s) regardless of close type. Trade #{ticket}. Account breached on the 4th short-held trade.`,
  },
  {
    category: "Weekend Holding",
    label: "Position Held Into Weekend Close",
    message: `Weekend holding violation: position on {symbol} (ticket #{ticket}) was held open into the weekend market close. Positions must be closed before weekend close to avoid gap risk. Crypto pairs are exempt from this rule.`,
  },
  {
    category: "News Trading",
    label: "Trade Near High-Impact News",
    message: `News trading violation: trade opened on {symbol} near high-impact news event "{event_title}". No trades may be opened 5 minutes before or 5 minutes after a high-impact news event. Trade #{ticket}`,
  },
  {
    category: "Drawdown",
    label: "Maximum Drawdown Exceeded",
    message: `Hi {name}, your FundedNG challenge account has been closed due to exceeding the maximum allowed drawdown.\nYou're welcome to start a new challenge anytime at fundedng.fun 💪\n— FundedNG Team`,
  },
  {
    category: "Inactivity",
    label: "Account Inactive",
    message: `Hi {name}, your FundedNG challenge account has been closed due to inactivity. Our rules require at least 1 trade every calendar week to keep your account active. Unfortunately no trading activity was detected on your account within the required period.\nYou're welcome to start a new challenge anytime at fundedng.fun 💪\n— FundedNG Team`,
  },
] as const;

function SettingsPage() {
  const [rate, setRate] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const loadRate = async () => {
    try {
      const res = await fetch("/api/exchange-rate");
      const data = await res.json();
      if (data?.rate) {
        setRate(data.rate);
        setInputValue(data.rate.toString());
        setUpdatedAt(data.updatedAt ?? null);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => { loadRate(); }, []);

  const handleSave = async () => {
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Enter a valid positive number");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("Not authenticated"); return; }

      const res = await fetch("/api/admin/set-exchange-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rate: parsed }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to save"); return; }

      setRate(parsed);
      setUpdatedAt(new Date().toISOString());
      toast.success(`Rate updated: ₦${parsed.toLocaleString()}/$`);
    } catch {
      toast.error("Failed to save rate");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <h2 className="font-display text-xl font-bold">Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">USD/NGN Exchange Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Current Rate</div>
                  <div className="font-display mt-1 text-2xl font-bold text-primary">
                    {rate ? `₦${rate.toLocaleString()}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Per</div>
                  <div className="font-display mt-1 text-lg font-semibold">$1 USD</div>
                </div>
              </div>
              {updatedAt && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Last updated: {new Date(updatedAt).toLocaleString()}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-input">Set Exchange Rate</Label>
              <div className="flex gap-2">
                <Input
                  id="rate-input"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="e.g. 1550"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="max-w-xs"
                />
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving…</> : <><Save className="mr-1 h-4 w-4" /> Save</>}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Enter the current USD/NGN exchange rate manually. This rate is used to calculate Naira prices for USD challenges. Update it when the market rate changes significantly. Default fallback is ₦1,550.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Breach Reason Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-muted-foreground">
            Copy these pre-written breach messages when manually breaching accounts or for reference.
            Placeholders like {"{symbol}"} and {"{ticket}"} are replaced automatically by the system.
          </p>
          <div className="space-y-3">
            {breachReasons.map((r, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {r.category}
                    </span>
                    <span className="text-xs text-muted-foreground">—</span>
                    <span className="text-sm font-medium">{r.label}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => handleCopy(r.message, i)}
                  >
                    {copiedIdx === i ? (
                      <><Check className="h-3.5 w-3.5 text-green-500" /> Copied</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy</>
                    )}
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap rounded-md bg-background/50 p-2 font-mono text-xs leading-relaxed text-foreground">
                  {r.message}
                </pre>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
