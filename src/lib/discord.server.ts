import { createClient } from "@supabase/supabase-js";

async function getDiscordWebhookUrl(): Promise<string> {
  if (process.env.DISCORD_WEBHOOK_URL) return process.env.DISCORD_WEBHOOK_URL;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "discord_webhook_url")
    .maybeSingle();

  return (data as any)?.value ?? "";
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
}

export async function sendDiscordNotification(
  content: string,
  embeds?: DiscordEmbed[],
): Promise<void> {
  const webhookUrl = await getDiscordWebhookUrl();
  if (!webhookUrl) {
    console.warn("[discord] Missing webhook URL — skipping");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[discord] send failed:", err);
    }
  } catch (e) {
    console.error("[discord] send error:", e);
  }
}
