import { useEffect, useRef, useState } from "react";
import { Mail, AlertTriangle, CheckCircle, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const NEW_USER_FLAG = "fng-new-user";

export function NewUserInstallPrompt() {
  const [open, setOpen] = useState(false);
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (triggeredRef.current) return;
    let isNew = false;
    try {
      isNew = localStorage.getItem(NEW_USER_FLAG) === "1";
    } catch { /* ignore */ }
    if (!isNew) return;
    const t = setTimeout(() => {
      triggeredRef.current = true;
      setOpen(true);
      try { localStorage.removeItem(NEW_USER_FLAG); } catch { /* ignore */ }
    }, 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="font-display text-center text-2xl">
            Check Your Email ✉️
          </DialogTitle>
          <DialogDescription className="text-center">
            We sent a welcome email to your inbox. To make sure you never miss account updates, requests, and payout notifications:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Check your spam folder</span>
              — If you find our email there, mark it as <strong>"Not Spam"</strong>.
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Move to Primary / Mark as Important</span>
              — Add <strong>support@fundedng.fun</strong> to your contacts so our emails always reach you.
            </div>
          </div>
        </div>

        <Button className="font-display mt-2 w-full" onClick={() => setOpen(false)}>
          Got it — I'll check now
        </Button>
      </DialogContent>
    </Dialog>
  );
}
