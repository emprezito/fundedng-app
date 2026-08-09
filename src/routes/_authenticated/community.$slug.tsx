import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, ImagePlus, Send, Smile, X } from "lucide-react";
import { MessageBubble, type ChatMessage } from "@/components/community/MessageBubble";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHasPurchase } from "@/hooks/use-has-purchase";

export const Route = createFileRoute("/_authenticated/community/$slug")({ component: GroupChatPage });

const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏"];

interface DbMessage {
  id: string;
  group_id: string;
  user_id: string;
  body: string | null;
  image_url: string | null;
  reply_to_id: string | null;
  created_at: string;
}
interface DbReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}
interface TypingRow {
  group_id: string;
  user_id: string;
  updated_at: string;
}

function GroupChatPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasPurchase = useHasPurchase();

  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [isMember, setIsMember] = useState(false);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [reactions, setReactions] = useState<DbReaction[]>([]);
  const [reads, setReads] = useState<Record<string, Set<string>>>({}); // messageId -> set of userIds
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<TypingRow[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // ----- Resolve group + membership -----
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: g } = await supabase
        .from("community_groups")
        .select("id, name")
        .eq("slug", slug)
        .maybeSingle();
      if (!g) {
        toast.error("Group not found");
        navigate({ to: "/community" });
        return;
      }
      setGroupId(g.id);
      setGroupName(g.name);
      const { data: m } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", g.id)
        .eq("user_id", user.id)
        .maybeSingle();
      setIsMember(!!m);
    })();
  }, [slug, user?.id]);

  // ----- Load messages, reactions, reads, authors -----
  const refreshAuthors = async (userIds: string[]) => {
    const missing = userIds.filter((id) => !authors[id]);
    if (missing.length === 0) return;
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", missing);
    if (data) {
      setAuthors((prev) => {
        const next = { ...prev };
        for (const p of data as { id: string; full_name: string }[]) {
          next[p.id] = p.full_name || "Trader";
        }
        return next;
      });
    }
  };

  // Read-only viewers (no purchase) should still see messages.
  const canRead = !!groupId && (isMember || hasPurchase === false);
  const canPost = isMember && hasPurchase === true;

  useEffect(() => {
    if (!groupId || !canRead) return;
    (async () => {
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(200);
      const ms = (msgs as DbMessage[]) ?? [];
      setMessages(ms);
      const ids = ms.map((m) => m.id);
      if (ids.length > 0) {
        const [{ data: rxs }, { data: rds }] = await Promise.all([
          supabase.from("message_reactions").select("*").in("message_id", ids),
          supabase.from("message_reads").select("message_id, user_id").in("message_id", ids),
        ]);
        setReactions((rxs as DbReaction[]) ?? []);
        const map: Record<string, Set<string>> = {};
        for (const r of (rds as { message_id: string; user_id: string }[]) ?? []) {
          if (!map[r.message_id]) map[r.message_id] = new Set();
          map[r.message_id].add(r.user_id);
        }
        setReads(map);
      }
      await refreshAuthors([...new Set(ms.map((m) => m.user_id))]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    })();
  }, [groupId, canRead]);

  // ----- Realtime subscriptions -----
  useEffect(() => {
    if (!groupId || !canRead || !user) return;

    const channel = supabase
      .channel(`group:${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const m = payload.new as DbMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          await refreshAuthors([m.user_id]);
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          });
          if (m.user_id !== user.id) {
            // mark as read
            (async () => {
              try { await supabase.from("message_reads").insert({ message_id: m.id, user_id: user.id }); } catch { /* ignore */ }
            })();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const r = payload.new as DbReaction;
          setReactions((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
        } else if (payload.eventType === "DELETE") {
          const old = payload.old as DbReaction;
          setReactions((prev) => prev.filter((x) => x.id !== old.id));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (payload) => {
        const r = payload.new as { message_id: string; user_id: string };
        setReads((prev) => {
          const next = { ...prev };
          if (!next[r.message_id]) next[r.message_id] = new Set();
          next[r.message_id].add(r.user_id);
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_status", filter: `group_id=eq.${groupId}` }, (payload) => {
        const row = (payload.new ?? payload.old) as TypingRow;
        if (payload.eventType === "DELETE") {
          setTypingUsers((prev) => prev.filter((t) => t.user_id !== row.user_id));
        } else {
          setTypingUsers((prev) => {
            const filtered = prev.filter((t) => t.user_id !== row.user_id);
            return [...filtered, row];
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, canRead, user?.id]);

  // Expire stale typing entries
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 4000;
      setTypingUsers((prev) => prev.filter((t) => new Date(t.updated_at).getTime() > cutoff));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // ----- Mark messages read on view -----
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const unread = messages.filter(
      (m) => m.user_id !== user.id && !(reads[m.id]?.has(user.id))
    );
    if (unread.length === 0) return;
    (async () => {
      try { await supabase.from("message_reads").insert(unread.map((m) => ({ message_id: m.id, user_id: user.id }))); } catch { /* ignore */ }
    })();
  }, [messages, user?.id]);

  // ----- Typing notifier -----
  const notifyTyping = () => {
    if (!user || !groupId) return;
    (async () => {
      try { await supabase.from("typing_status").upsert({ group_id: groupId, user_id: user.id, updated_at: new Date().toISOString() }); } catch { /* ignore */ }
    })();
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      (async () => {
        try { await supabase.from("typing_status").delete().eq("group_id", groupId).eq("user_id", user.id); } catch { /* ignore */ }
      })();
    }, 3000);
  };

  // ----- Send message -----
  const sendMessage = async () => {
    if (!user || !groupId) return;
    const body = text.trim();
    let imageUrl: string | null = null;

    if (imagePreview && fileInputRef.current?.files?.[0]) {
      setUploading(true);
      const file = fileInputRef.current.files[0];
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { contentType: file.type });
      setUploading(false);
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      const { data: signed } = await supabase.storage
        .from("chat-attachments")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      imageUrl = signed?.signedUrl ?? null;
    }

    if (!body && !imageUrl) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      group_id: groupId,
      user_id: user.id,
      body: body || null,
      image_url: imageUrl,
      reply_to_id: replyTo?.id ?? null,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    setReplyTo(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ----- React -----
  const onReact = async (m: ChatMessage, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(
      (r) => r.message_id === m.id && r.user_id === user.id && r.emoji === emoji
    );
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: m.id, user_id: user.id, emoji });
    }
  };

  // ----- File picker -----
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      e.target.value = "";
      return;
    }
    setImagePreview(URL.createObjectURL(file));
  };

  // ----- Build view models -----
  const enriched = useMemo<ChatMessage[]>(() => {
    const byId = new Map(messages.map((m) => [m.id, m] as const));
    return messages.map((m) => {
      const rx = reactions.filter((r) => r.message_id === m.id);
      const grouped = new Map<string, { count: number; mine: boolean }>();
      for (const r of rx) {
        const cur = grouped.get(r.emoji) ?? { count: 0, mine: false };
        cur.count += 1;
        if (user && r.user_id === user.id) cur.mine = true;
        grouped.set(r.emoji, cur);
      }
      const replySrc = m.reply_to_id ? byId.get(m.reply_to_id) : null;
      const others = reads[m.id] ? [...reads[m.id]].filter((u) => u !== m.user_id) : [];
      return {
        id: m.id,
        user_id: m.user_id,
        body: m.body,
        image_url: m.image_url,
        reply_to_id: m.reply_to_id,
        created_at: m.created_at,
        author_name: authors[m.user_id] || "Trader",
        reply_to: replySrc
          ? {
              id: replySrc.id,
              body: replySrc.body,
              image_url: replySrc.image_url,
              author_name: authors[replySrc.user_id] || "Trader",
            }
          : null,
        reactions: [...grouped.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })),
        read_by_others: others.length > 0,
      };
    });
  }, [messages, reactions, reads, authors, user?.id]);

  const typingNames = typingUsers
    .filter((t) => t.user_id !== user?.id)
    .map((t) => authors[t.user_id]?.split(" ")[0] || "Someone");

  // ----- Join CTA when not member AND user has purchased -----
  if (groupId && !isMember && hasPurchase === true) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="font-display text-2xl font-bold">{groupName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Join this group to start chatting.</p>
        <Button
          className="mt-4 font-display"
          onClick={async () => {
            const { error } = await supabase
              .from("group_members")
              .insert({ group_id: groupId, user_id: user!.id });
            if (error) {
              toast.error(error.message);
              return;
            }
            setIsMember(true);
          }}
        >
          Join {groupName}
        </Button>
        <div className="mt-4">
          <Link to="/community" className="text-xs text-muted-foreground underline">
            Back to community
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 top-0 bottom-0 z-40 flex flex-col bg-background md:static md:h-screen">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/community" })}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {groupName.charAt(0).toUpperCase() || "G"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-semibold">{groupName || "Group"}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {typingNames.length > 0
              ? `${typingNames.slice(0, 2).join(", ")} typing…`
              : "Active community"}
          </div>
        </div>
      </header>

      {hasPurchase === false && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-warning/10 px-3 py-2 text-[11px] text-warning">
          🔒 Read-only — <Link to="/buy" className="underline">purchase a challenge</Link> to post.
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto py-3">
        {enriched.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Be the first to say hello 👋
          </div>
        ) : (
          enriched.map((m, i) => {
            const prev = i > 0 ? enriched[i - 1] : null;
            const showAuthor = !prev || prev.user_id !== m.user_id;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isMine={m.user_id === user?.id}
                showAuthor={showAuthor}
                onReply={setReplyTo}
                onReact={onReact}
                onOpenImage={setLightbox}
              />
            );
          })
        )}
      </div>

      {/* Reply preview */}
      {canPost && replyTo && (
        <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-2 text-xs">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-primary">Replying to {replyTo.author_name}</div>
            <div className="truncate text-muted-foreground">
              {replyTo.body || (replyTo.image_url ? "📷 Photo" : "")}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} className="rounded-full p-1 hover:bg-muted">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Image preview */}
      {canPost && imagePreview && (
        <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
          <img src={imagePreview} alt="Preview" className="h-12 w-12 rounded object-cover" />
          <span className="flex-1 text-xs text-muted-foreground">Image attached</span>
          <button
            onClick={() => {
              setImagePreview(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="rounded-full p-1 hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Composer */}
      {canPost ? (
      <div className="flex items-center gap-2 border-t border-border bg-background px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Attach image"
        >
          <ImagePlus className="h-5 w-5" />
        </button>
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Emoji"
            >
              <Smile className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-8 gap-1">
              {QUICK.map((e) => (
                <button
                  key={e}
                  className="grid h-8 w-8 place-items-center rounded text-lg hover:bg-muted"
                  onClick={() => {
                    setText((t) => t + e);
                    setEmojiOpen(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            notifyTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Aa"
          className="h-10 rounded-full bg-muted px-4"
        />
        <Button
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={sendMessage}
          disabled={sending || uploading || (!text.trim() && !imagePreview)}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      ) : (
        <div className="border-t border-border bg-background px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] text-center text-xs text-muted-foreground">
          {hasPurchase === false ? (
            <>
              <Link to="/buy" className="font-display text-primary hover:underline">Purchase a challenge</Link> to join and post.
            </>
          ) : (
            "Loading…"
          )}
        </div>
      )}

      {/* Image lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl bg-background p-2">
          {lightbox && <img src={lightbox} alt="Full size" className="mx-auto max-h-[80vh] rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}