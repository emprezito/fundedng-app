const PIXEL_ID =
  typeof window !== "undefined" ? import.meta.env.VITE_FB_PIXEL_ID : undefined;

type MetaEvent =
  | "PageView"
  | "ViewContent"
  | "InitiateCheckout"
  | "AddToCart"
  | "AddPaymentInfo"
  | "Purchase"
  | "Lead"
  | "CompleteRegistration"
  | "Search"
  | "Contact";

type MetaEventProperties = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    fbq?: {
      (...args: unknown[]): void;
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[][];
      loaded?: boolean;
      version?: string;
    };
  }
}

export function initFbPixel(): void {
  if (typeof window === "undefined" || !PIXEL_ID) return;
  if (window.fbq) return;

  const w = window as any;
  const f = w;
  const fbq = (f.fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
    else fbq.queue!.push(args);
  });
  if (!f._fbq) f._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  const t = document.createElement("script");
  t.async = true;
  t.src = "https://connect.facebook.net/en_US/fbevents.js";
  const s = document.getElementsByTagName("script")[0]!;
  s.parentNode?.insertBefore(t, s);

  fbq("init", PIXEL_ID);
  fbq("track", "PageView");
}

export function trackPageView(properties?: MetaEventProperties): void {
  if (typeof window === "undefined" || !window.fbq) return;
  (window.fbq as any)("track", "PageView");
  if (properties && Object.keys(properties).length > 0) {
    (window.fbq as any)("track", "ViewContent", properties);
  }
}

export function trackEvent(
  event: MetaEvent,
  properties?: MetaEventProperties,
  eventID?: string,
): void {
  if (typeof window === "undefined" || !window.fbq || !PIXEL_ID) return;
  if (eventID) {
    (window.fbq as any)("track", event, properties, { eventID });
  } else {
    (window.fbq as any)("track", event, properties);
  }
}

export function trackPurchase(
  value: number,
  eventID?: string,
  properties?: MetaEventProperties,
): void {
  trackEvent("Purchase", { value, currency: "NGN", ...properties }, eventID);
}

export function generateEventId(prefix = "evt"): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function captureFbclid(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid");
    if (fbclid) localStorage.setItem("_fbclid", fbclid);
  } catch {
    /* ignore */
  }
}

export function getFbp(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

export function getFbc(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const fbclid = localStorage.getItem("_fbclid");
    if (!fbclid) return undefined;
    return `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`;
  } catch {
    return undefined;
  }
}