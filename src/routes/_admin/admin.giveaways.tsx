import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAdminData } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { grantGiveawayServer } from "@/server/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_admin/admin/giveaways")({
  component: GiveawaysPage,
});

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

type WinnerResult = {
  email: string;
  outcome: "delivered" | "pending" | "not_found" | "error";
  message: string;
  reference?: string;
};

function GiveawaysPage() {
  const { challengeList } = useAdminData();
  const [emailsRaw, setEmailsRaw] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [autoDeliver, setAutoDeliver] = useState(true);
  const [note, setNote] = useState("");
  const [granting, setGranting] = useState(false);
  const [results, setResults] = useState<WinnerResult[]>([]);
  const [lastGranted, setLastGranted] = useState<string | null>(null);

  const emails = parseEmails(emailsRaw);
  const challenge = challengeList.find((c: any) => c.id === challengeId);

  const submit = async () => {
    if (!challengeId) return toast.error("Select a challenge to grant");
    if (emails.length === 0) return toast.error("Enter at least one valid email address");
    const mode = autoDeliver ? "auto-delivered from the account pool" : "queued for manual delivery";
    if (!confirm(`Grant ${emails.length} ${challenge?.name ?? "challenge"} account${emails.length === 1 ? "" : "s"}? Recipients will be ${mode}.`)) return;

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.access_token) return toast.error("Please sign in again");

    setGranting(true);
    setResults([]);
    try {
      const res = await grantGiveawayServer({
        data: {
          accessToken: sess.session.access_token,
          challengeId,
          emails,
          autoDeliver,
          note: note.trim() || undefined,
        },
      });
      if (!res?.ok) return toast.error(res?.error ?? "Giveaway failed");
      setResults(res.results);
      setLastGranted(String(res.challengeName ?? ""));
      const delivered = res.results.filter((r) => r.outcome === "delivered").length;
      const pending = res.results.filter((r) => r.outcome === "pending").length;
      const failed = res.results.filter((r) => r.outcome !== "delivered" && r.outcome !== "pending").length;
      toast.success(`${delivered} delivered · ${pending} queued · ${failed} failed`);
      setEmailsRaw("");
      setNote("");
    } catch (e: any) {
      toast.error(e?.message ?? "Giveaway failed");
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <h2 className="font-display text-xl font-bold">Giveaways</h2>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-display text-base font-bold">Grant Free Accounts</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Grant free challenge accounts to giveaway winners. Emails are resolved to existing accounts only — unknown emails are reported as failures and never create new users.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Winner emails (comma or newline separated)</label>
            <textarea
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
              placeholder={"winner1@example.com\nwinner2@example.com"}
              rows={4}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {emailsRaw.trim() && (
              <p className="mt-1 text-xs text-muted-foreground">
                {emails.length} valid email{emails.length === 1 ? "" : "s"} detected
                {emails.length !== parseEmails(emailsRaw).length ? "" : ""}
                {parseEmails(emailsRaw).length < emailsRaw.split(/[\s,;]+/).filter(Boolean).length ? " — some lines were skipped (invalid or duplicate)" : ""}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Challenge</label>
              <select
                value={challengeId}
                onChange={(e) => setChallengeId(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select challenge…</option>
                {challengeList.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {String(c.name ?? "Challenge")} — {c.currency === "USD" ? "$" : "₦"}{Number(c.account_size ?? 0).toLocaleString()}{c.category ? ` (${String(c.category).toUpperCase()})` : ""}
                  </option>
                ))}
              </select>
              {challenge && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Currency: {challenge.currency ?? "NGN"} · Phase 1 account; pool lookup uses account size {Number(challenge.account_size ?? 0).toLocaleString()}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Delivery</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAutoDeliver(true)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${autoDeliver ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground hover:bg-accent"}`}
                >
                  Auto-deliver now
                </button>
                <button
                  type="button"
                  onClick={() => setAutoDeliver(false)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${!autoDeliver ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground hover:bg-accent"}`}
                >
                  Send to Pending
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {autoDeliver
                  ? "Claims an available account from the pool and delivers instantly. Falls back to Pending if the pool is empty."
                  : "Creates the order; the account is fulfilled manually from the Pending tab."}
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Note (optional, for internal tracking)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Road to Riches IG giveaway — 10 winners"
              className="mt-1"
            />
          </div>

          <Button onClick={submit} disabled={granting || emails.length === 0 || !challengeId}>
            {granting ? "Granting…" : `Grant ${emails.length || ""} account${emails.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>

      {lastGranted && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="font-display text-base font-bold">{lastGranted}</div>
          <p className="mt-1 text-xs text-muted-foreground">Last giveaway results</p>
          <div className="mt-3 space-y-2">
            {results.length === 0 && <div className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">No winners granted.</div>}
            {results.map((r) => (
              <div key={r.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm">{r.email}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.message}
                    {r.reference ? <span className="font-mono"> · {r.reference}</span> : null}
                  </div>
                </div>
                <Badge variant={r.outcome === "delivered" ? "default" : r.outcome === "pending" ? "secondary" : "destructive"} className="shrink-0">
                  {r.outcome}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}