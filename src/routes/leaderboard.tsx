import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicHeader } from "@/components/site/PublicHeader";
import { Brand } from "@/components/site/Brand";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface ActivityEvent {
  id: string;
  event_type: "payout_paid" | "phase2_approved" | "funded_approved" | "phase1_to_phase2" | "phase2_to_funded" | "payout_approved";
  anonymized_name: string;
  avatar_initials: string;
  challenge_name: string;
  currency: string;
  amount: number | null;
  account_size: number | null;
  created_at: string;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function currSym(c: string) { return c === "USD" ? "$" : "₦"; }
function fmtAmt(c: string, v: number) { return `${currSym(c)}${Math.abs(v).toLocaleString()}`; }

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [newActivityId, setNewActivityId] = useState<string | null>(null);
  const [totalPayouts, setTotalPayouts] = useState<number>(0);

  const BASE_PAYOUT_NGN = 27_890_350;

  useEffect(() => {
    async function fetchTotalPayouts() {
      const { data: payoutData } = await supabase
        .from("payouts")
        .select("amount_naira, currency")
        .eq("status", "paid");
      const { data: manualData } = await supabase
        .from("live_activity")
        .select("amount, metadata")
        .eq("event_type", "payout_approved");
      let total = BASE_PAYOUT_NGN;
      for (const p of payoutData ?? []) {
        total += p.currency === "USD" ? Number(p.amount_naira) / 1550 : Number(p.amount_naira);
      }
      for (const m of manualData ?? []) {
        const metaAmt = (m.metadata as any)?.payout_amount;
        total += Number(metaAmt ?? m.amount ?? 0);
      }
      setTotalPayouts(total);
    }

    fetchTotalPayouts();

    supabase.from("live_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setActivity(data as ActivityEvent[]);
      });

    const actChannel = supabase
      .channel("live-activity-public")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "live_activity",
      }, (payload) => {
        const newRow = payload.new as any;
        setActivity(prev => [newRow, ...prev].slice(0, 20));
        setNewActivityId(newRow.id);
        setTimeout(() => setNewActivityId(null), 3000);
        if (newRow.event_type === "payout_approved") {
          const metaAmt = newRow.metadata?.payout_amount;
          const amt = Number(metaAmt ?? newRow.amount ?? 0);
          if (amt > 0) setTotalPayouts(prev => prev + amt);
        }
      })
      .subscribe();

    const payoutChannel = supabase
      .channel("payout-total-public")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "payouts",
      }, () => {
        supabase
          .from("payouts")
          .select("amount_naira, currency")
          .eq("status", "paid")
          .then(({ data }) => {
            if (!data) return;
            let realTotal = 0;
            for (const p of data) {
              realTotal += p.currency === "USD" ? Number(p.amount_naira) / 1550 : Number(p.amount_naira);
            }
            supabase
              .from("live_activity")
              .select("amount, metadata")
              .eq("event_type", "payout_approved")
              .then(({ data: manualData }) => {
                let manualTotal = 0;
                for (const m of manualData ?? []) {
                  const metaAmt = (m.metadata as any)?.payout_amount;
                  manualTotal += Number(metaAmt ?? m.amount ?? 0);
                }
                setTotalPayouts(BASE_PAYOUT_NGN + realTotal + manualTotal);
              });
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(actChannel);
      supabase.removeChannel(payoutChannel);
    };
  }, []);

  return (
    <div className="min-h-screen">
      <PublicHeader />



      {/* ── Live Activity Feed ──────────────────────────────────────── */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-5xl px-4 py-16 md:px-6">
          <div className="flex items-center gap-2 mb-8">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
            <h2 className="font-display text-2xl font-bold">Recent Activity</h2>
          </div>

          <div className="mb-8 rounded-xl border border-green-400/20 bg-green-400/5 p-6">
            <p className="text-sm text-muted-foreground mb-1">Total Payouts</p>
            <p className="font-display text-3xl font-bold text-green-400">
              ₦{totalPayouts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Paid out to funded traders</p>
          </div>

          {activity.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Activity will appear here as traders get funded and paid.
            </div>
          ) : (
            <div className="space-y-2">
              {activity.map((event) => {
                const isNew = event.id === newActivityId;
                const timeAgo = formatTimeAgo(new Date(event.created_at));

                const eventConfig = {
                  payout_paid: {
                    emoji: "💰",
                    color: "text-green-400",
                    bgColor: "bg-green-400/10 border-green-400/20",
                    glowRgb: "52,211,153",
                    label: "received a payout",
                    value: event.currency === "USD"
                      ? `$${Number(event.amount).toFixed(2)}`
                      : `₦${Number(event.amount).toLocaleString()}`,
                  },
                  phase2_approved: {
                    emoji: "🎯",
                    color: "text-blue-400",
                    bgColor: "bg-blue-400/10 border-blue-400/20",
                    glowRgb: "96,165,250",
                    label: "advanced to Phase 2",
                    value: event.currency === "USD"
                      ? `$${Number(event.account_size).toLocaleString()} account`
                      : `₦${Number(event.account_size).toLocaleString()} account`,
                  },
                  funded_approved: {
                    emoji: "🏆",
                    color: "text-yellow-400",
                    bgColor: "bg-yellow-400/10 border-yellow-400/20",
                    glowRgb: "250,204,21",
                    label: "became a funded trader",
                    value: event.currency === "USD"
                      ? `$${Number(event.account_size).toLocaleString()} account`
                      : `₦${Number(event.account_size).toLocaleString()} account`,
                  },
                  phase1_to_phase2: {
                    emoji: "🎯",
                    color: "text-blue-400",
                    bgColor: "bg-blue-400/10 border-blue-400/20",
                    glowRgb: "96,165,250",
                    label: "advanced to Phase 2",
                    value: `₦${Number(event.account_size).toLocaleString()} account`,
                  },
                  phase2_to_funded: {
                    emoji: "🏆",
                    color: "text-yellow-400",
                    bgColor: "bg-yellow-400/10 border-yellow-400/20",
                    glowRgb: "250,204,21",
                    label: "became a funded trader",
                    value: `₦${Number(event.account_size).toLocaleString()} account`,
                  },
                  payout_approved: {
                    emoji: "💰",
                    color: "text-green-400",
                    bgColor: "bg-green-400/10 border-green-400/20",
                    glowRgb: "52,211,153",
                    label: "received a payout",
                    value: `₦${Number(event.amount).toLocaleString()}`,
                  },
                }[event.event_type] ?? null;

                if (!eventConfig) return null;

                return (
                  <div
                    key={event.id}
                    className={`activity-card flex items-center gap-3 rounded-xl border p-3 ${
                      isNew ? "activity-new" : ""
                    } ${eventConfig.bgColor}`}
                    style={{
                      animation: isNew ? "slide-in-3d 0.6s cubic-bezier(0.23,1,0.32,1) forwards" : undefined,
                      perspective: "800px",
                    }}
                  >
                    <div className="relative shrink-0">
                      <div
                        className="w-9 h-9 rounded-full bg-card flex items-center justify-center font-display font-bold text-sm border border-border"
                        style={{
                          animation: "glow-pulse 2.5s ease-in-out infinite",
                          ["--glow-rgb" as string]: eventConfig.glowRgb,
                        }}
                      >
                        {event.avatar_initials}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 text-xs leading-none">{eventConfig.emoji}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold">{event.anonymized_name}</span>
                        {" "}<span className="text-muted-foreground">{eventConfig.label}</span>
                      </p>
                      <p className={`text-xs font-medium ${eventConfig.color}`}>
                        {eventConfig.value}
                      </p>
                    </div>

                    <div className="text-xs text-muted-foreground shrink-0">
                      {timeAgo}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Activity Animations */}
      <style>{`
        @keyframes slide-in-3d {
          0% {
            opacity: 0;
            transform: perspective(800px) rotateY(-6deg) translateX(50px) scale(0.97);
            box-shadow: 0 0 0 0 rgba(52,211,153,0);
          }
          50% {
            opacity: 1;
            transform: perspective(800px) rotateY(1.5deg) translateX(-4px) scale(1.01);
          }
          100% {
            opacity: 1;
            transform: perspective(800px) rotateY(0deg) translateX(0) scale(1);
            box-shadow: 0 4px 20px -4px rgba(var(--glow-rgb, 52,211,153), 0.25);
          }
        }
        @keyframes glow-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(var(--glow-rgb, 52,211,153), 0);
          }
          50% {
            box-shadow: 0 0 10px 2px rgba(var(--glow-rgb, 52,211,153), 0.35);
          }
        }
        .activity-new {
          border-color: rgba(var(--glow-rgb, 52,211,153), 0.3) !important;
          background: rgba(var(--glow-rgb, 52,211,153), 0.08) !important;
        }
      `}</style>

      {/* CTA */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
          <h2 className="font-display text-3xl font-bold">Think you can make the list?</h2>
          <p className="mt-3 text-muted-foreground">Join FundedNG, pass the challenge, and start earning real payouts.</p>
          <Link to="/buy" className="mt-8 inline-block">
            <Button size="lg" className="font-display">Start Now <ArrowLeft className="ml-2 h-4 w-4 rotate-180" /></Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 text-center md:px-6">
        <Brand />
        <p className="mx-auto mt-4 max-w-2xl text-xs text-muted-foreground">
          FundedNG is a proprietary trading evaluation platform. Challenge fees
          fund operational costs. All evaluations run on FundedNG MT5 evaluation
          accounts — you trade real-market prices in a controlled evaluation
          environment. Past performance does not guarantee future results.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <Link to="/rules" className="text-muted-foreground hover:text-primary">Rules</Link>
          <Link to="/agreement" className="text-muted-foreground hover:text-primary">Agreement & Risk</Link>
        </div>
        <div className="mt-4 text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} FundedNG. All rights reserved.
        </div>
      </footer>
    </div>
  );
}


