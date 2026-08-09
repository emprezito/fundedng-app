import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FALLBACK_RATE = 1550;

export async function getUSDRate(): Promise<number> {
  try {
    const { data: cached } = await supabaseAdmin
      .from("app_config")
      .select("value")
      .eq("key", "usd_exchange_rate")
      .single();

    if (cached?.value) {
      return parseFloat(cached.value);
    }
    return FALLBACK_RATE;
  } catch {
    return FALLBACK_RATE;
  }
}

export async function getCachedUSDRate(): Promise<{ rate: number; updatedAt: string | null }> {
  const [{ data: cached }, { data: updatedAt }] = await Promise.all([
    supabaseAdmin.from("app_config").select("value").eq("key", "usd_exchange_rate").single(),
    supabaseAdmin.from("app_config").select("value").eq("key", "usd_rate_updated_at").single(),
  ]);
  return {
    rate: cached?.value ? parseFloat(cached.value) : FALLBACK_RATE,
    updatedAt: updatedAt?.value ?? null,
  };
}

export async function setUSDRate(rate: number): Promise<void> {
  await supabaseAdmin.from("app_config")
    .upsert({ key: "usd_exchange_rate", value: rate.toString() }, { onConflict: "key" });
  await supabaseAdmin.from("app_config")
    .upsert({ key: "usd_rate_updated_at", value: new Date().toISOString() }, { onConflict: "key" });
}

export function usdToNaira(usdAmount: number, rate: number): number {
  return Math.ceil(usdAmount * rate);
}
