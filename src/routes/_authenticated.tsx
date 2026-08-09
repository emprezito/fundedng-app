import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/site/AppShell";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function AuthLayout() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/auth/register", replace: true });
    }
    if (!isLoading && isAuthenticated && isAdmin && pathname === "/dashboard") {
      navigate({ to: "/admin", replace: true });
    }
  }, [isLoading, isAuthenticated, isAdmin, navigate, pathname]);

  // Full-screen spinner while session resolves — never flash protected content.
  if (isLoading || !isAuthenticated) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="font-display text-xs tracking-[0.3em]">LOADING…</p>
        </div>
      </div>
    );
  }
  return <AppShell />;
}
