import { supabase } from "@/integrations/supabase/client";

// Mirror of EmailEvent (kept local so this client file never imports the
// .server module — the bundler blocks server files from client chunks).
export type EmailEvent =
  | { type: "welcome"; userId: string }
  | { type: "purchase_confirmed"; orderId: string }
  | { type: "mt5_delivered"; orderId: string; mt5Login: string; mt5Password: string; mt5Server: string }
  | { type: "phase1_passed"; accountId: string }
  | { type: "funded"; accountId: string }
  | { type: "payout_requested"; payoutId: string }
  | { type: "payout_approved"; payoutId: string }
  | { type: "payout_paid"; payoutId: string }
  | { type: "payout_rejected"; payoutId: string; reason?: string }
  | { type: "breached"; accountId: string; reason: string }
  | { type: "kyc_approved"; userId: string }
  | { type: "phase_rejected"; accountId: string; reason: string; phaseType: "phase2" | "funded" };

/**
 * Fire-and-forget client helper to trigger a transactional email via
 * /api/send-email. Always non-blocking — failures are logged but never
 * thrown so they cannot break the UX flow that triggered them.
 */
export async function notifyEmail(event: EmailEvent) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch("/api/send-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ event }),
    });
  } catch (e) {
    console.warn("[notifyEmail] failed", e);
  }
}