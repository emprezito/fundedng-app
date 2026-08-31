const PIXEL_ID = process.env.META_PIXEL_ID || "2351562142328029";
const TOKEN = process.env.META_PIXEL_TOKEN || "";
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashValue(value?: string): Promise<string | undefined> {
  const clean = value?.trim().toLowerCase();
  if (!clean) return Promise.resolve(undefined);
  return sha256Hex(clean);
}

export type MetaEventName =
  | "InitiateCheckout"
  | "Purchase"
  | "Lead"
  | "CompleteRegistration"
  | "ViewContent";

export interface MetaEventInput {
  eventName: MetaEventName;
  eventId?: string;
  value?: number;
  currency?: string;
  email?: string;
  externalId?: string;
  fbp?: string;
  fbc?: string;
  sourceUrl?: string;
  clientIp?: string;
  userAgent?: string;
}

/**
 * Fire-and-forget send of an event to the Meta Conversions API.
 *
 * Never throws — payment flows must not be blocked by analytics. No-ops when
 * META_PIXEL_TOKEN is not set (so local dev without the secret is safe).
 */
export async function sendMetaEvent(input: MetaEventInput): Promise<void> {
  if (!TOKEN) {
    console.warn("[meta-capi] META_PIXEL_TOKEN not set; skipping", input.eventName);
    return;
  }

  const [em, externalId] = await Promise.all([
    hashValue(input.email),
    hashValue(input.externalId),
  ]);

  const customData = input.value != null
    ? {
        value: Number(input.value.toFixed(2)),
        currency: input.currency || "NGN",
        ...(input.eventName === "Purchase" && input.eventId
          ? { order_id: input.eventId }
          : {}),
      }
    : undefined;

  const userData: Record<string, unknown> = {
    em: em ? [em] : undefined,
    external_id: externalId ? [externalId] : undefined,
    fbp: input.fbp,
    fbc: input.fbc,
    client_ip_address: input.clientIp,
    client_user_agent: input.userAgent,
  };

  const payload = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        event_source_url: input.sourceUrl,
        action_source: "website",
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${TOKEN}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return;
    const text = await res.text().catch(() => "");
    console.error(
      "[meta-capi] event rejected",
      input.eventName,
      res.status,
      text.slice(0, 300),
    );
  } catch (e) {
    console.error("[meta-capi] send failed", input.eventName, e);
  }
}