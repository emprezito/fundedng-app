import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { Home, PlusCircle, BarChart3, User, ShieldCheck, LogOut, Gift, Handshake, LifeBuoy, Download } from "lucide-react";
import { Brand } from "./Brand";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: Home, match: (p: string) => p.startsWith("/dashboard") },
  { to: "/buy", label: "Buy", icon: PlusCircle, match: (p: string) => p.startsWith("/buy") },
  { to: "/support", label: "Support", icon: LifeBuoy, match: (p: string) => p.startsWith("/support") },
  { to: "/affiliate", label: "Affiliate", icon: Gift, match: (p: string) => p.startsWith("/affiliate") },
  { to: "/stats", label: "Stats", icon: BarChart3, match: (p: string) => p.startsWith("/stats") },
  { to: "/profile", label: "Profile", icon: User, match: (p: string) => p.startsWith("/profile") },
] as const;

/**
 * Persistent left sidebar for desktop. Exported so non-_authenticated routes
 * (e.g. /buy, which must remain public) can render the same chrome when the
 * visitor IS signed in.
 */
export function AppSidebar() {
  const { pathname } = useLocation();
  const { user, profile, isAdmin, isPartner, signOut } = useAuth();

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems = isPartner ? NAV.filter((n) => n.label !== "Affiliate") : NAV;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background/60 md:flex md:fixed md:inset-y-0 md:left-0">
      <div className="flex h-16 items-center px-6">
        <Brand />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            to="/admin"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <ShieldCheck className="h-4 w-4" /> Admin
          </Link>
        )}
        {isPartner && (
          <Link
            to="/partner"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/partner")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Handshake className="h-4 w-4" /> Partner
          </Link>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-md p-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display truncate text-sm font-semibold">
              {profile?.full_name || "Trader"}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">{user?.email}</div>
          </div>
          <button
            onClick={signOut}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Mobile bottom-nav for authenticated users. */
export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { isPartner } = useAuth();
  // Support appears inside the Profile page on mobile (not in bottom nav)
  const mobileItems = NAV.filter((n) => n.label !== "Support");
  const mobileNav = isPartner
    ? [...mobileItems.filter((n) => n.label !== "Affiliate"), { to: "/partner", label: "Partner", icon: Handshake, match: (p: string) => p.startsWith("/partner") }]
    : mobileItems;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {mobileNav.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110")} />
              <span className="font-display tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Persistent authenticated app layout.
 * - Top bar with logo + notification bell
 * - Mobile: bottom nav with 4 tabs
 * - Desktop: left sidebar with same items + user card at bottom
 */
export function AppShell() {
  const { pathname } = useLocation();

  // The chat conversation route uses a full-viewport layout for the composer,
  // so it bypasses the shell entirely. Every other authenticated page gets
  // the sticky top bar, desktop sidebar and mobile bottom nav.
  const isChat = /^\/community\/[^/]+/.test(pathname);

  // Stats page also gets full layout
  if (isChat) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen md:flex">
      <AppSidebar />

      {/* Main column */}
      <div className="min-w-0 flex-1 md:ml-60">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
          <div className="md:hidden">
            <Brand />
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1">
            <a
              href="/fundedng.apk"
              download
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              title="Download the FundedNG App"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">App</span>
            </a>
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="pb-24 md:pb-0">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}