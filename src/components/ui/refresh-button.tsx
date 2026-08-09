import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  onRefresh: () => void | Promise<void>;
  className?: string;
  label?: string;
  size?: "sm" | "default" | "icon";
}

/**
 * Small pill button that triggers a data reload for the current page/tab.
 * Spins the icon while the async refresh runs so users get visual feedback
 * without having to do a full browser refresh.
 */
export function RefreshButton({ onRefresh, className, label = "Refresh", size = "sm" }: RefreshButtonProps) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      // brief minimum spin so users notice the action
      setTimeout(() => setBusy(false), 350);
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={handle}
      disabled={busy}
      className={cn("gap-1.5", className)}
      aria-label="Refresh data"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      {size !== "icon" && <span className="text-xs">{label}</span>}
    </Button>
  );
}