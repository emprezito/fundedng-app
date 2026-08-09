import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

/**
 * Global push & in-app notifications:
 * - Asks for browser Notification permission on first authenticated mount.
 * - Listens for new rows on `notifications` for the current user → toast + native push.
 * - Listens for new `messages` rows across all groups the user belongs to → toast + native push.
 *   Suppressed when the user is already viewing that group's chat (/community/<slug>).
 */

interface NotificationCtx {
  permission: NotificationPermission | "unsupported";
  request: () => Promise<void>;
}

const Ctx = createContext<NotificationCtx | undefined>(undefined);

const isBrowser = () => typeof window !== "undefined" && typeof Notification !== "undefined";

function showNativePush(title: string, body: string, tag?: string) {
  if (!isBrowser()) return;
  if (Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    // Only fire native push when the tab is hidden — the toast handles the in-app case.
    return;
  }
  try {
    const n = new Notification(title, {
      body,
      tag: tag ?? "fundedng",
      icon: "/favicon.ico",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore — some browsers throw if the page isn't fully active */
  }
}

async function setBadge(count: number) {
  try {
    if ("setAppBadge" in navigator) {
      await navigator.setAppBadge(count);
    }
  } catch { /* badge API unsupported */ }
}

async function clearBadge() {
  try {
    if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }
  } catch { /* badge API unsupported */ }
}

async function syncBadge(userId: string) {
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (count && count > 0) await setBadge(count);
  else await clearBadge();
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    isBrowser() ? Notification.permission : "unsupported",
  );
  const groupsRef = useRef<Map<string, string>>(new Map()); // groupId -> groupName
  const authorsRef = useRef<Map<string, string>>(new Map()); // userId -> full_name

  const request = async () => {
    if (!isBrowser()) return;
    if (Notification.permission === "default") {
      const result = await Notification.requestPermission();
      setPermission(result);
    } else {
      setPermission(Notification.permission);
    }
  };

  // Sync badge count with the OS app icon when the page becomes visible
  // (user switches back to the app after receiving notifications).
  useEffect(() => {
    if (!user) return;
    const onShow = () => syncBadge(user.id);
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [user?.id]);

  // Auto-request permission once after sign-in.
  useEffect(() => {
    if (!isAuthenticated || !isBrowser()) return;
    if (Notification.permission === "default") {
      // Defer slightly so we don't race the page load.
      const t = window.setTimeout(() => {
        Notification.requestPermission().then(setPermission).catch(() => {});
      }, 1500);
      return () => window.clearTimeout(t);
    }
  }, [isAuthenticated]);

  // Sync badge on mount.
  useEffect(() => {
    if (!user) return;
    syncBadge(user.id);
  }, [user?.id]);

  // Subscribe to system notifications for this user.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { title: string; message: string; type: string; id: string };
          const fn =
            n.type === "error" ? toast.error : n.type === "success" ? toast.success : toast;
          fn(n.title, { description: n.message });
          showNativePush(n.title, n.message, `notif:${n.id}`);
          syncBadge(user.id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Subscribe to messages across all of the user's groups.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Load group memberships + group names.
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);
      const groupIds = (memberships ?? []).map((m: any) => m.group_id);
      if (cancelled || groupIds.length === 0) return;

      const { data: groups } = await supabase
        .from("community_groups")
        .select("id, name, slug")
        .in("id", groupIds);
      const slugMap = new Map<string, string>();
      for (const g of (groups ?? []) as any[]) {
        groupsRef.current.set(g.id, g.name);
        slugMap.set(g.id, g.slug);
      }

      const groupSet = new Set(groupIds);

      channel = supabase
        .channel(`user-messages:${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          async (payload) => {
            const m = payload.new as {
              id: string;
              group_id: string;
              user_id: string;
              body: string | null;
              image_url: string | null;
            };
            if (m.user_id === user.id) return;
            if (!groupSet.has(m.group_id)) return;
            // Suppress if currently viewing that group's chat.
            const slug = slugMap.get(m.group_id);
            if (
              typeof window !== "undefined" &&
              slug &&
              window.location.pathname.startsWith(`/community/${slug}`)
            ) {
              return;
            }

            // Resolve author display name (cached).
            let author = authorsRef.current.get(m.user_id);
            if (!author) {
              const { data: prof } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", m.user_id)
                .maybeSingle();
              author = (prof as any)?.full_name || "Trader";
              authorsRef.current.set(m.user_id, author!);
            }

            const groupName = groupsRef.current.get(m.group_id) ?? "Group";
            const preview = m.body
              ? m.body.length > 120
                ? m.body.slice(0, 117) + "…"
                : m.body
              : m.image_url
              ? "📷 Photo"
              : "New message";
            const title = `${author} · ${groupName}`;
            toast(title, { description: preview });
            showNativePush(title, preview, `msg:${m.group_id}`);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return <Ctx.Provider value={{ permission, request }}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}