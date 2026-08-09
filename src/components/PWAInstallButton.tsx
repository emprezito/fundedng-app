import { Download, Smartphone } from "lucide-react";

const APK_URL = "/fundedng.apk";

export function useInstallPrompt() {
  return {
    available: false,
    install: async () => false as boolean,
    isIOS: false,
    isStandalone: false,
  };
}

/**
 * Persistent install banner shown on all pages. Prompts the user to download
 * the Android APK or install the PWA. Dismissible per session only.
 */
export function PWAInstallButton() {
  return (
    <div className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-display text-sm font-semibold">Get the FundedNG App</div>
            <p className="text-xs text-muted-foreground">
              Install for instant alerts, faster access, and the best experience.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={APK_URL}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Download APK
          </a>
        </div>
      </div>
    </div>
  );
}
