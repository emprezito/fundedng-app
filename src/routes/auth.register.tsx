import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Brand } from "@/components/site/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { subscribeToPush } from "@/lib/push";
import { notifyEmail } from "@/lib/notify-email";

export const Route = createFileRoute("/auth/register")({ component: RegisterPage });

function RegisterPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate({ to: "/dashboard", replace: true });
  }, [isAuthenticated, isLoading, navigate]);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) return setError("Password must be at least 8 characters");
    setLoading(true); setError("");
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: form.full_name, phone: form.phone },
      },
    });
    setLoading(false);
    if (error) return setError(error.message);
    // Mark this session as "freshly registered" so the dashboard can prompt
    // them to install the app to their device. One-shot — cleared after use.
    try { localStorage.setItem("fng-new-user", "1"); } catch { /* ignore */ }
    // Send welcome email via notifyEmail (fire-and-forget)
    if (signUpData?.user?.id) {
      notifyEmail({ type: "welcome", userId: signUpData.user.id });
    }
    // Auto-subscribe to push notifications (fire-and-forget)
    if (signUpData?.user?.id) {
      subscribeToPush(signUpData.user.id, supabase);
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Brand size="lg" />
          <h1 className="font-display mt-6 text-3xl font-bold">Create Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Start your trading journey today</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-8">
          {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={(e)=>setForm({...form, full_name:e.target.value})} required className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} required className="mt-1" />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input value={form.phone} onChange={(e)=>setForm({...form, phone:e.target.value})} placeholder="08012345678" className="mt-1" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e)=>setForm({...form, password:e.target.value})} required minLength={8} placeholder="Min 8 characters" className="mt-1" />
            </div>
            <Button type="submit" className="font-display w-full" disabled={loading}>
              {loading ? "Creating..." : "Create Account →"}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already registered? <Link to="/auth/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
