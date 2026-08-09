import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, ShieldCheck, ShoppingBag, LogOut, BarChart3, LifeBuoy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const { profile, user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate font-display text-xl">
              {profile?.full_name || "Trader"}
            </CardTitle>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {isAdmin && <Badge variant="default" className="text-[10px]">Admin</Badge>}
              {profile?.kyc_verified ? (
                <Badge className="bg-success text-primary-foreground text-[10px]">KYC verified</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">KYC pending</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Link to="/dashboard">
            <Button variant="outline" className="w-full justify-start">
              <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
            </Button>
          </Link>
          <Link to="/stats">
            <Button variant="outline" className="w-full justify-start">
              <BarChart3 className="mr-2 h-4 w-4" /> Stats
            </Button>
          </Link>
          <Link to="/support" className="md:hidden">
            <Button variant="outline" className="w-full justify-start">
              <LifeBuoy className="mr-2 h-4 w-4" /> Support
            </Button>
          </Link>
          <Link to="/buy">
            <Button variant="outline" className="w-full justify-start">
              <ShoppingBag className="mr-2 h-4 w-4" /> Buy a challenge
            </Button>
          </Link>
          {isAdmin && (
            <Link to="/admin">
              <Button variant="outline" className="w-full justify-start">
                <ShieldCheck className="mr-2 h-4 w-4" /> Admin console
              </Button>
            </Link>
          )}
          <Button
            variant="destructive"
            className="mt-2 w-full justify-start"
            onClick={async () => {
              await signOut();
              navigate({ to: "/" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}