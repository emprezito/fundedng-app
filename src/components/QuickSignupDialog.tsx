import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { subscribeToPush } from "@/lib/push";
import { notifyEmail } from "@/lib/notify-email";

interface QuickSignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  next?: string;
}

export function QuickSignupDialog({ open, onOpenChange, onComplete, next }: QuickSignupDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setEmail("");
    setPassword("");
    setError("");
    setLoading(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setLoading(true);
    setError("");
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${next ?? "/buy"}`,
        data: { full_name: email.split("@")[0] },
      },
    });
    if (signUpError) {
      setLoading(false);
      if (signUpError.message.toLowerCase().includes("already registered")) {
        setError("This email is already registered. Sign in below to continue with your discount.");
        return;
      }
      return setError(signUpError.message);
    }
    if (data?.session === null) {
      // Email confirmation is enabled — keep the funnel open; they'll come
      // back to /buy via emailRedirectTo (or the sign-in link).
      toast.success("Account created! Confirm your email, then come right back to complete your purchase.");
      reset();
      onOpenChange(false);
      return;
    }
    toast.success("Account created — continuing to checkout!");
    try { localStorage.setItem("fng-new-user", "1"); } catch { /* ignore */ }
    if (data?.user?.id) {
      notifyEmail({ type: "welcome", userId: data.user.id });
      subscribeToPush(data.user.id, supabase);
    }
    reset();
    onOpenChange(false);
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-2xl">
            <Gift className="h-5 w-5 text-primary" />
            You've secured your discount
          </DialogTitle>
          <DialogDescription>
            Create your free account to complete your purchase and see your live dashboard immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error && <Alert variant="destructive" className="mb-2"><AlertDescription>{error}</AlertDescription></Alert>}
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@email.com" className="mt-1" autoFocus />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Min 8 characters" className="mt-1" />
          </div>
          <Button type="submit" className="font-display w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account & continue →"}
          </Button>
        </form>

        <DialogFooter className="sm:justify-center">
          <div className="text-center text-xs text-muted-foreground">
            Already registered?{" "}
            <Link
              to="/auth/login"
              search={next ? { next } : undefined}
              className="text-primary hover:underline"
            >
              Sign in
            </Link>{" "}
            to use your discount.
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}