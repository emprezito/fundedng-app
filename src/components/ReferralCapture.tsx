import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const REF_KEY = "fng-ref";
const PARTNER_REF_KEY = "fng-partner-ref";

/**
 * Reads ?ref=CODE from any URL on the site, persists it in localStorage,
 * and once a user signs in (and has no referrer yet) attaches the referral
 * via attach_referral RPC. Also tries the same code as a Partner promo code:
 * tracks the click immediately and attaches partner referral after signin.
 * Domain-agnostic by design.
 */
export function ReferralCapture() {
  const { user } = useAuth();

  // 1. Capture ?ref=CODE from URL into localStorage + record partner click
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref");
      if (code && code.length >= 4) {
        const upper = code.toUpperCase();
        localStorage.setItem(REF_KEY, upper);
        localStorage.setItem(PARTNER_REF_KEY, upper);
        // Fire-and-forget partner click tracker (RPC returns false if not a partner code)
        (async () => {
          try {
            await supabase.rpc("track_partner_click", {
              _code: upper,
              _ua: navigator.userAgent,
              _ref: document.referrer || undefined,
            });
          } catch { /* ignore */ }
        })();
      }
    } catch {
      /* ignore */
    }
  }, []);

  // 2. After signin, attach affiliate + partner referrals (server validates)
  useEffect(() => {
    if (!user) return;
    let code: string | null = null;
    let pcode: string | null = null;
    try {
      code = localStorage.getItem(REF_KEY);
      pcode = localStorage.getItem(PARTNER_REF_KEY);
    } catch { /* ignore */ }
    if (code) {
      (async () => {
        try {
          const { data, error } = await supabase.rpc("attach_referral", { _code: code });
          if (!error && data) {
            try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      })();
    }
    if (pcode) {
      (async () => {
        try {
          const { data, error } = await supabase.rpc("attach_partner_referral", { _code: pcode });
          if (!error && data) {
            try { localStorage.removeItem(PARTNER_REF_KEY); } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      })();
    }
  }, [user]);

  return null;
}
