import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { trackPurchase, getFbp, getFbc } from "@/lib/fb-pixel";

export const Route = createFileRoute("/payment/callback")({
  validateSearch: z.object({
    reference: z.string().optional(),
    trxref: z.string().optional(),
    challenge_id: z.string().optional(),
    dp: z.coerce.number().optional(),
    dc: z.string().optional(),
    pp: z.string().optional(),
    oa: z.coerce.number().optional(),
  }),
  component: PaymentCallback,
});

function PaymentCallback() {
  const { reference, trxref, challenge_id, dp, dc, pp, oa } = Route.useSearch();
  const { session, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const ranRef = useRef(false);
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Confirming your payment with Squad…");
  const [orderId, setOrderId] = useState<string | null>(null);

  const ref = reference ?? trxref;

  useEffect(() => {
    if (authLoading) return;
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      if (!ref || !challenge_id) {
        setStatus("error");
        setMessage("Missing payment reference. If you were charged, contact support.");
        return;
      }
      if (!session?.access_token) {
        setStatus("error");
        setMessage("Your session expired. Please sign in again to confirm your payment.");
        return;
      }
      try {
        const res = await fetch("/api/verify-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ reference: ref, challenge_id, discount_percent: dp, discount_code: dc, partner_promo_code: pp, original_amount: oa, fbp: getFbp(), fbc: getFbc() }),
        });
        const result = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          order_id?: string;
          amount_naira?: number;
          error?: string;
        };
        if (!res.ok || !result.ok || !result.order_id) {
          setStatus("error");
          setMessage(result.error ?? "Payment verification failed");
          return;
        }
        setOrderId(result.order_id);
        setStatus("success");
        setMessage("Payment confirmed! Your account is being prepared.");
        toast.success("Payment confirmed!");
        trackPurchase(
          Number(result.amount_naira ?? 0) || (oa ? oa / 100 : 0),
          `purchase_${result.order_id}`,
        );

        fetch("/api/notify-new-purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: result.order_id }),
          keepalive: true,
        }).catch(() => {});
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Payment verification failed");
      }
    })();
  }, [authLoading, ref, challenge_id, session?.access_token]);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        {status === "verifying" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="font-display mt-4 text-2xl font-bold">Verifying payment</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <h1 className="font-display mt-4 text-2xl font-bold">Payment successful</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            {orderId && (
              <p className="mt-2 text-xs text-muted-foreground">Order #{orderId.slice(0, 8)}</p>
            )}
            <Button
              className="font-display mt-6 w-full"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              Continue to dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="font-display mt-4 text-2xl font-bold">Verification failed</h1>
            <Alert variant="destructive" className="mt-4 text-left">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <div className="mt-6 grid gap-2">
              <Button asChild className="font-display">
                <Link to="/buy">Back to checkout</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}