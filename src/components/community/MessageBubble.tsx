import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Reply, Smile, Image as ImageIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

export interface ChatMessage {
  id: string;
  user_id: string;
  body: string | null;
  image_url: string | null;
  reply_to_id: string | null;
  created_at: string;
  author_name?: string;
  reply_to?: { id: string; body: string | null; image_url: string | null; author_name?: string } | null;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  read_by_others?: boolean;
}

interface Props {
  message: ChatMessage;
  isMine: boolean;
  showAuthor: boolean;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onOpenImage: (url: string) => void;
}

export function MessageBubble({ message, isMine, showAuthor, onReply, onReact, onOpenImage }: Props) {
  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, isMine ? [-80, 0] : [0, 80], [1, 0]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const triggered = isMine ? info.offset.x < -60 : info.offset.x > 60;
    if (triggered) onReply(message);
    x.set(0);
  };

  return (
    <div className={cn("group relative flex w-full px-3", isMine ? "justify-end" : "justify-start")}>
      {/* Reply hint icon revealed during swipe */}
      <motion.div
        style={{ opacity: replyOpacity }}
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-primary",
          isMine ? "right-1" : "left-1"
        )}
      >
        <Reply className="h-5 w-5" />
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        style={{ x }}
        onDragEnd={handleDragEnd}
        className={cn("flex max-w-[78%] flex-col gap-1", isMine ? "items-end" : "items-start")}
      >
        {showAuthor && !isMine && (
          <span className="px-2 text-[11px] text-muted-foreground">{message.author_name || "Trader"}</span>
        )}

        <div className={cn("relative flex items-end gap-1", isMine && "flex-row-reverse")}>
          <div
            className={cn(
              "rounded-2xl px-3 py-2 text-sm shadow-sm",
              isMine
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-muted text-foreground"
            )}
          >
            {message.reply_to && (
              <div
                className={cn(
                  "mb-1 rounded-lg border-l-2 px-2 py-1 text-[11px]",
                  isMine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary/60 bg-background/60"
                )}
              >
                <div className="font-semibold opacity-80">{message.reply_to.author_name || "Reply"}</div>
                <div className="line-clamp-2 opacity-80">
                  {message.reply_to.body || (message.reply_to.image_url ? "📷 Photo" : "")}
                </div>
              </div>
            )}

            {message.image_url && (
              <button
                onClick={() => onOpenImage(message.image_url!)}
                className="mb-1 block overflow-hidden rounded-lg"
              >
                <img
                  src={message.image_url}
                  alt="Shared"
                  className="max-h-64 w-full max-w-[260px] object-cover"
                  loading="lazy"
                />
              </button>
            )}
            {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
          </div>

          {/* Hover actions */}
          <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground">
                  <Smile className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-1" align={isMine ? "end" : "start"}>
                <div className="flex gap-1">
                  {QUICK_REACTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        onReact(message, e);
                        setPickerOpen(false);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-muted"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={() => onReply(message)}
              className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Reply"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Reactions row */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={cn("flex flex-wrap gap-1", isMine ? "justify-end" : "justify-start")}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(message, r.emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  r.mine
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Read receipt for own messages */}
        {isMine && (
          <span className="px-2 text-[10px] text-muted-foreground">
            {message.read_by_others ? "Seen" : "Sent"}
          </span>
        )}
      </motion.div>
    </div>
  );
}

// Helper kept exported for parent imports if needed
export const QUICK_REACTIONS_LIST = QUICK_REACTIONS;
// imported just for tree-shaking guard
export const __unused = ImageIcon;