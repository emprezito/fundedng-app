import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Returns true once the current user has at least one order with status
 * `paid` or `delivered`. Used to gate community posting and post-purchase
 * UI like the install prompt modal.
 */
export function useHasPurchase() {
  const { user } = useAuth();
  const [hasPurchase, setHasPurchase] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setHasPurchase(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["paid", "delivered"])
      .then(({ count }) => {
        if (!cancelled) setHasPurchase((count ?? 0) > 0);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return hasPurchase;
}