import { createFileRoute } from "@tanstack/react-router";
import { useAdminData } from "@/hooks/useAdminData";
import { formatNaira } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/_admin/admin/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { stats, unprovisionedOrders } = useAdminData();

  return (
    <div className="mt-6">
      {unprovisionedOrders.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            ⚠️ <strong>{unprovisionedOrders.length} paid order(s)</strong> have no account delivered.{" "}
            <a href="/admin/pending" className="cursor-pointer underline">Check the Pending tab immediately.</a>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Traders", stats.traders],
          ["Accounts Sold (Funded Value)", formatNaira(stats.sold), "text-primary"],
          ["Accounts Delivered", stats.accounts],
          ["Active", stats.active],
          ["Passed", stats.passed],
          ["Funded", stats.funded, "text-primary"],
          ["Breached", stats.breached],
          ["Pass Rate", `${stats.passRate}%`, "text-gold"],
          ["Pending Payouts", stats.pending, "text-warning"],
          ["Revenue", formatNaira(stats.revenue), "text-primary"],
          ["Payouts Paid", formatNaira(stats.paid), "text-destructive"],
        ].map(([l, v, c]: any) => (
          <div key={l} className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className={`font-display mt-2 text-2xl font-bold ${c ?? ""}`}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
