import { Outlet, Link, createRootRoute, useLocation, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";
import { Toaster } from "@/components/ui/sonner";
import { ReferralCapture } from "@/components/ReferralCapture";
import { initTikTokPixel, trackPageView, captureTtclid } from "@/lib/tiktok-pixel";
import { useEffect } from "react";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="font-display text-7xl font-bold text-primary text-glow">404</div>
        <h2 className="mt-4 font-display text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FundedNG — Nigeria's Prop Trading Firm" },
      { name: "description", content: "Get funded up to ₦2,000,000. Three simple rules. Payouts within 24 hours. Trade on the FundedNG MT5 evaluation platform." },
      { property: "og:title", content: "FundedNG — Nigeria's Prop Trading Firm" },
      { property: "og:description", content: "Get funded up to ₦2,000,000. Three simple rules. Payouts within 24 hours. Trade on the FundedNG MT5 evaluation platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "FundedNG — Nigeria's Prop Trading Firm" },
      { name: "twitter:description", content: "Get funded up to ₦2,000,000. Three simple rules. Payouts within 24 hours. Trade on the FundedNG MT5 evaluation platform." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/c2a87901-c47d-47f6-b172-e1333c79d14d" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/c2a87901-c47d-47f6-b172-e1333c79d14d" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&family=Poppins:wght@300;400;500;600;700&family=Pinyon+Script&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        {import.meta.env.VITE_TIKTOK_PIXEL_ID && (
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(t,e){var n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src="https://analytics.tiktok.com/i18n/pixel/static/identify_manager?v=4.0.2";var o=document.getElementsByTagName("script")[0];o.parentNode.insertBefore(n,o);ttq._t=+new Date,ttq._p=e,ttq._v="4.0.2";var i="https://analytics.tiktok.com/i18n/pixel/events.js?v=4.0.2";ttq.load(i,e)};ttq.load("","${import.meta.env.VITE_TIKTOK_PIXEL_ID}");ttq.page()}(window,document,"ttq");`,
            }}
          />
        )}
      </head>
      <body className="noise-overlay">
        {children}
        
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var inIframe=window.self!==window.top;var host=window.location.hostname;var isPreview=host.includes('id-preview--')||host.includes('lovableproject.com')||host.includes('lovable.dev');if((inIframe||isPreview)&&'serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});}}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker'in navigator){navigator.serviceWorker.addEventListener('controllerchange',function(){window.location.reload()})}`,
          }}
        />
        <Scripts />
      </body>
    </html>
  );
}

function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    initTikTokPixel();
    captureTtclid();
    trackPageView({ content_name: location.pathname, content_type: "webpage" });
  }, [location.pathname]);
  return null;
}

function RootComponent() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <PageTracker />
        <ReferralCapture />
        <Outlet />
        <Toaster />
      </NotificationsProvider>
    </AuthProvider>
  );
}
