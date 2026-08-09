import { Link, Outlet, useRouterState, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, Users2, Clock, Banknote, Trophy,
  Tag, LifeBuoy, Gift, Handshake, Database, ImageIcon,
  LogOut, ArrowLeft, ShieldCheck, Download, Menu, X
} from "lucide-react";
import { Brand } from "./Brand";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const ADMIN_NAV = [
  { label: "Overview",     to: "/admin",           icon: LayoutDashboard },
  { label: "Accounts",     to: "/admin/accounts",  icon: Users2 },
  { label: "Pending",      to: "/admin/pending",   icon: Clock },
  { label: "Payouts",      to: "/admin/payouts",   icon: Banknote },
  { label: "Challenges",   to: "/admin/challenges",icon: Trophy },
  { label: "Discounts",    to: "/admin/discounts", icon: Tag },
  { label: "Tickets",      to: "/admin/tickets",   icon: LifeBuoy },
  { label: "Affiliate",    to: "/admin/affiliate", icon: Gift },
  { label: "Partners",     to: "/admin/partners",  icon: Handshake },
  { label: "Account Pool", to: "/admin/pool",      icon: Database },
  { label: "Social Proof", to: "/admin/social",    icon: ImageIcon },
  { label: "Settings",     to: "/admin/settings",  icon: ShieldCheck },
] as const;

function AdminSidebarNav({ onNavClick }: { onNavClick?: () => void }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {ADMIN_NAV.map((item) => {
        const active = currentPath === item.to || (item.to === "/admin" && currentPath === "/admin");
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            to={item.to}
            onClick={onNavClick}
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
    </nav>
  );
}

function AdminSidebarUserCard() {
  const { user, profile, signOut } = useAuth();

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 rounded-md p-2">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-xs font-bold text-primary">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-sm font-semibold">
          {profile?.full_name || "Admin"}
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
  );
}

function AdminSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background/60 md:flex md:fixed md:inset-y-0 md:left-0">
      <div className="flex h-16 items-center px-6">
        <Brand />
      </div>
      <AdminSidebarNav />
      <div className="border-t border-border p-3">
        <Link
          to="/dashboard"
          className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <AdminSidebarUserCard />
      </div>
    </aside>
  );
}

export function AdminShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const closeNav = () => setMobileNavOpen(false);

  return (
    <div className="min-h-screen md:flex">
      <AdminSidebar />

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Brand />
        </div>
        <ThemeToggle />
      </header>

      {/* Mobile slide-in sidebar overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden transition-opacity duration-300",
          mobileNavOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={closeNav}
        />
        <aside
          className={cn(
            "absolute top-0 left-0 flex h-full w-60 flex-col border-r border-border bg-background transition-transform duration-300",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-16 items-center justify-between px-6">
            <Brand />
            <button
              onClick={closeNav}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <AdminSidebarNav onNavClick={closeNav} />
          <div className="border-t border-border p-3">
            <Link
              to="/dashboard"
              onClick={closeNav}
              className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
            <AdminSidebarUserCard />
          </div>
        </aside>
      </div>

      <div className="min-w-0 flex-1 md:ml-60">
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

        <main className="pb-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
