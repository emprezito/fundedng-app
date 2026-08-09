import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Brand } from "@/components/site/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/auth/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: isAdmin ? "/admin" : "/dashboard", replace: true });
    }
  }, [isAuthenticated, isLoading, isAdmin, navigate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    const uid = signInData.user?.id;
    const { data: roles } = uid
      ? await supabase.from("user_roles").select("role").eq("user_id", uid)
      : { data: null };
    const isAdminUser = roles?.some((r) => r.role === "admin");
    navigate({ to: isAdminUser ? "/admin" : "/dashboard", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Brand size="lg" />
          <h1 className="font-display mt-6 text-3xl font-bold">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to your trader dashboard</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-8">
          {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required className="mt-1" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">Forgot?</Link>
              </div>
              <Input id="password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required className="mt-1" />
            </div>
            <Button type="submit" className="font-display w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In →"}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to FundedNG? <Link to="/auth/register" className="text-primary hover:underline">Create account</Link>
        </p>
      </div>
    </div>
  );
}
