import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";

interface LiveActivity {
  id: string;
  event_type: string;
  anonymized_name: string;
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

function describeEvent(e: LiveActivity): string {
  const sym = e.currency === "USD" ? "$" : "₦";
  switch (e.event_type) {
    case "payout_paid":
    case "payout_approved":
      return `${e.anonymized_name} just received a ${sym}${Number(e.amount ?? 0).toLocaleString()} payout`;
    case "phase1_to_phase2":
    case "phase2_approved":
      return `${e.anonymized_name} advanced to Phase 2`;
    case "phase2_to_funded":
    case "funded_approved":
      return `${e.anonymized_name} became a funded trader`;
    default:
      return `${e.anonymized_name} just had some activity`;
  }
}

function eventEmoji(type: string): string {
  switch (type) {
    case "payout_paid":
    case "payout_approved": return "💰";
    case "phase1_to_phase2":
    case "phase2_approved": return "🎯";
    case "phase2_to_funded":
    case "funded_approved": return "🏆";
    default: return "📊";
  }
}

export function LeaderboardActivityBanner() {
  const [event, setEvent] = useState<LiveActivity | null>(null);

  useEffect(() => {
    supabase
      .from("live_activity")
      .select("id, event_type, anonymized_name, currency, amount, account_size, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEvent(data as LiveActivity);
      });

    const channel = supabase
      .channel("leaderboard-banner")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "live_activity",
      }, (payload) => {
        setEvent(payload.new as LiveActivity);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!event) return null;

  return (
    <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl shrink-0">{eventEmoji(event.event_type)}</span>
          <p className="text-sm truncate">
            {describeEvent(event)}
            <span className="ml-2 text-xs text-muted-foreground">{formatTimeAgo(new Date(event.created_at))}</span>
          </p>
        </div>
        <Link to="/leaderboard" className="shrink-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            See the live leaderboard & recent activity <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      </div>
    </div>
  );
}
