import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X, Download } from "lucide-react";
import { Brand } from "./Brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const PUBLIC_NAV = [
  { to: "/", label: "Home" },
  { to: "/rules", label: "Rules" },
  { to: "/partners", label: "Partners" },
  { to: "/agreement", label: "Agreement" },
] as const;

/**
 * Sticky public site header.
 * - Mobile: logo + hamburger menu that opens a full-screen sheet
 * - Desktop: logo + horizontal nav + Sign In / Get Funded CTAs
 * Used on /, /rules, /agreement.
 */
export function PublicHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Close menu when route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while mobile menu is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <Brand />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {PUBLIC_NAV.map((item) => {
            const active =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-foreground/70 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
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
          <Link
            to="/auth/login"
            className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
          >
            Sign In
          </Link>
          <Button asChild size="sm" className="font-display">
            <Link to="/auth/register">Get Funded</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-md text-foreground hover:bg-muted"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu sheet */}
      {open && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col bg-background md:hidden">
          <nav className="flex flex-col gap-1 px-4 pt-4">
            {PUBLIC_NAV.map((item) => {
              const active =
                item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-lg px-4 py-3 text-base font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-3 border-t border-border p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <Button asChild variant="outline" size="lg">
              <Link to="/auth/login">Sign In</Link>
            </Button>
            <Button asChild size="lg" className="font-display">
              <Link to="/auth/register">Get Funded</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}