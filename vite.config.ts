// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    importProtection: {
      client: {
        excludeFiles: [
          "**/node_modules/**",
          "**/server/*.functions*",
        ],
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      // CRITICAL: never enable in dev — service workers cache stale builds
      // and break the Lovable preview iframe.
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "favicon-32.png", "favicon.png"],
      manifest: {
        name: "FundedNG",
        short_name: "FundedNG",
        description: "Nigeria's Prop Trading Firm",
        theme_color: "#10b981",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/dashboard",
        scope: "/",
        icons: [
          { src: "/favicon-32.png", sizes: "32x32", type: "image/png" },
          { src: "/favicon.png", sizes: "192x192", type: "image/png" },
          { src: "/favicon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          { src: "/favicon-32.png", sizes: "32x32", type: "image/png", purpose: "monochrome" },
        ],
      },
      workbox: {
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
