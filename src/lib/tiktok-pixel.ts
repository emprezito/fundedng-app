const PIXEL_ID = typeof window !== "undefined"
  ? import.meta.env.VITE_TIKTOK_PIXEL_ID
  : undefined;

type TikTokEvent =
  | "ViewContent"
  | "AddToCart"
  | "AddToWishlist"
  | "CompletePayment"
  | "Contact"
  | "Download"
  | "InitiateCheckout"
  | "PlaceAnOrder"
  | "Search"
  | "StartTrial"
  | "SubmitForm"
  | "Subscribe";

type TikTokEventProperties = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    ttq?: {
      page: () => void;
      track: (event: TikTokEvent, properties?: TikTokEventProperties) => void;
      identify: (properties: { email?: string; phone_number?: string; external_id?: string }) => void;
      instance: (pixelId: string) => {
        page: () => void;
        track: (event: TikTokEvent, properties?: TikTokEventProperties) => void;
        identify: (properties: { email?: string; phone_number?: string; external_id?: string }) => void;
      };
    };
  }
}

export function initTikTokPixel(): void {
  if (typeof window === "undefined" || !PIXEL_ID) return;
  if (window.ttq) return;

  const w = window as any;
  const ttq = (w.ttq = w.ttq || []);
  ttq.methods = [
    "page", "track", "identify", "instances", "debug",
    "on", "off", "once", "ready", "alias", "group",
    "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent",
  ];
  ttq.setAndDefer = function (set: any, fn: string) {
    set[fn] = function () {
      set.push([fn].concat(Array.prototype.slice.call(arguments, 0)));
    };
  };
  for (let i = 0; i < ttq.methods.length; i++) {
    ttq.setAndDefer(ttq, ttq.methods[i]);
  }
  ttq.load = function (e: string, t: string) {
    const n = document.createElement("script");
    n.type = "text/javascript";
    n.async = true;
    n.src = "https://analytics.tiktok.com/i18n/pixel/static/identify_manager?v=4.0.2";
    const o = document.getElementsByTagName("script")[0];
    o?.parentNode?.insertBefore(n, o);
    ttq._t = +new Date();
    ttq._p = t;
    ttq._v = "4.0.2";
    const i = "https://analytics.tiktok.com/i18n/pixel/events.js?v=4.0.2";
    ttq.load(i, t);
  };
  ttq.load("", PIXEL_ID);
}

export function trackPageView(properties?: TikTokEventProperties): void {
  if (typeof window === "undefined" || !window.ttq) return;
  window.ttq.page();
  if (properties) {
    window.ttq.track("ViewContent", properties);
  }
}

export function trackEvent(event: TikTokEvent, properties?: TikTokEventProperties): void {
  if (typeof window === "undefined" || !window.ttq) return;
  window.ttq.track(event, properties);
}

export function trackClick(label: string, properties?: TikTokEventProperties): void {
  trackEvent("ViewContent", { content_name: `click_${label}`, ...properties });
}

export function trackConversion(label: string, value?: number): void {
  trackEvent("CompletePayment", {
    content_name: label,
    value,
    currency: "NGN",
  });
}

export function identifyUser(email?: string, phone?: string): void {
  if (typeof window === "undefined" || !window.ttq || (!email && !phone)) return;
  window.ttq.identify({ email, phone_number: phone });
}

export function captureTtclid(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ttclid = params.get("ttclid");
  if (ttclid) {
    try {
      localStorage.setItem("_ttclid", ttclid);
    } catch {}
  }
}
