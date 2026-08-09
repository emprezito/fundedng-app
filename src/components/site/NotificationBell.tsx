import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Notification bell with realtime unread count, dropdown on desktop,
 * bottom sheet on mobile. Marks all unread as read when opened.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Initial load + realtime subscription
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadCount = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      const c = count ?? 0;
      if (!cancelled) {
        setUnread(c);
        try {
          if (c > 0 && "setAppBadge" in navigator) await navigator.setAppBadge(c);
          else if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
        } catch { /* noop */ }
      }
    };
    loadCount();
    const channel = supabase
      .channel(`bell:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => loadCount(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Click outside on desktop
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onTouch = (e: TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onTouch);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onTouch);
    };
  }, [open]);

  const fetchItems = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setItems((data as NotificationItem[]) ?? []);
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true } as never)
      .eq("user_id", user.id)
      .eq("is_read", false);
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try { if ("clearAppBadge" in navigator) await navigator.clearAppBadge(); } catch { /* noop */ }
  };

  const handleOpen = async () => {
    setOpen(true);
    await fetchItems();
    // Auto-mark all as read on open
    await markAllRead();
  };

  const Panel = (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="font-display text-sm font-semibold">Notifications</div>
        <button
          onClick={markAllRead}
          className="text-[11px] text-primary hover:underline disabled:opacity-50"
          disabled={items.every((n) => n.is_read)}
        >
          <Check className="mr-1 inline h-3 w-3" />
          Mark all read
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="grid place-items-center px-6 py-12 text-center">
            <BellOff className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">No notifications yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You'll see updates about your account here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "flex gap-3 px-4 py-3 text-sm",
                  !n.is_read && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    n.is_read ? "bg-transparent" : "bg-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-display truncate text-sm font-semibold">
                      {n.title}
                    </div>
                    <div className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {n.message}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="relative grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-12 z-[60] overflow-hidden rounded-xl border border-border bg-background shadow-2xl",
            // Mobile: anchor to right of bell, span most of viewport width.
            // Desktop: fixed 360px panel.
            "w-[min(22rem,calc(100vw-1.5rem))] md:w-[360px]",
          )}
        >
          {Panel}
        </div>
      )}
    </div>
  );
}
