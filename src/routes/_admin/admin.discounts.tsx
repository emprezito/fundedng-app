import { createFileRoute } from "@tanstack/react-router";
import { useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_admin/admin/discounts")({
  component: DiscountsPage,
});

function DiscountsPage() {
  const { discountCodes, discountForm, discountSaving, challengeList, setDiscountForm, saveDiscountCode, toggleDiscountActive } = useAdminData();

  return (
    <div className="mt-6 space-y-4">
      <h2 className="font-display text-xl font-bold">Promo Discounts</h2>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-display text-base font-bold">Create Promo Discount</div>
        <p className="mt-1 text-xs text-muted-foreground">Create percentage-off promo codes for checkout. Partner links already apply 15% off automatically.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,120px,140px,180px,180px,auto]">
          <Input placeholder="CODE" value={discountForm.code} onChange={(e) => setDiscountForm({ ...discountForm, code: e.target.value.toUpperCase() })} />
          <Input type="number" min={1} max={100} step={0.5} placeholder="% off" value={discountForm.percent_off} onChange={(e) => setDiscountForm({ ...discountForm, percent_off: e.target.value })} />
          <Input type="number" min={1} placeholder="Max uses" value={discountForm.max_redemptions} onChange={(e) => setDiscountForm({ ...discountForm, max_redemptions: e.target.value })} />
          <Input type="datetime-local" value={discountForm.expires_at} onChange={(e) => setDiscountForm({ ...discountForm, expires_at: e.target.value })} />
          <select value={discountForm.challenge_id} onChange={(e) => setDiscountForm({ ...discountForm, challenge_id: e.target.value })}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors">
            <option value="">Any Challenge</option>
            {challengeList.map((c: any) => (<option key={c.id} value={c.id}>{c.name} — {Number(c.account_size).toLocaleString()}</option>))}
          </select>
          <Button onClick={saveDiscountCode} disabled={discountSaving === "new"}>{discountSaving === "new" ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <div className="space-y-2">
        {discountCodes.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No promo codes yet.</div>
        ) : discountCodes.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <div className="font-display font-semibold"><span className="font-mono text-primary">{d.code}</span> · {d.percent_off}% off{d.challenge_id ? ` · ${challengeList.find((c: any) => c.id === d.challenge_id)?.name ?? "Specific challenge"}` : ""}</div>
              <div className="text-xs text-muted-foreground">Used {d.redemption_count ?? 0}{d.max_redemptions ? ` / ${d.max_redemptions}` : ""}{d.expires_at ? ` · Expires ${new Date(d.expires_at).toLocaleString()}` : " · No expiry"}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">{d.is_active ? "active" : "inactive"}</Badge>
              <Button size="sm" variant="outline" onClick={() => toggleDiscountActive(d)} disabled={discountSaving === d.id}>{d.is_active ? "Deactivate" : "Activate"}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
