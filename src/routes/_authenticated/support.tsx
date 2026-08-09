import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Plus, ArrowLeft, Send, LifeBuoy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/support")({ component: SupportPage });

const CATEGORIES = ["Account Issue", "Payout Issue", "Technical Problem", "Rule Clarification", "Other"] as const;

const statusBadge: Record<string, string> = {
  open: "bg-warning/15 text-warning border-warning/30",
  in_progress: "bg-info/15 text-info border-info/30",
  resolved: "bg-primary/15 text-primary border-primary/30",
};

interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: "trader" | "admin";
  message: string;
  created_at: string;
}

function SupportPage() {
  const { user, profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Ticket detail view
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const loadTickets = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTickets((data ?? []) as Ticket[]);
  };

  useEffect(() => { loadTickets(); }, [user]);

  const loadMessages = async (ticketId: string) => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as TicketMessage[]);
  };

  const openTicket = (t: Ticket) => {
    setSelectedTicket(t);
    setReplyText("");
    loadMessages(t.id);
  };

  const createTicket = async () => {
    if (!user) return toast.error("Please sign in");
    if (!subject.trim()) return toast.error("Subject is required");
    if (!category) return toast.error("Category is required");
    if (message.trim().length < 20) return toast.error("Message must be at least 20 characters");
    setSubmitting(true);

    // Create the ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .insert({
        user_id: user.id,
        subject: subject.trim(),
        category,
        status: "open",
      })
      .select()
      .single();
    if (ticketErr) {
      setSubmitting(false);
      return toast.error(ticketErr.message);
    }

    // Insert first message
    const { error: msgErr } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_role: "trader",
        message: message.trim(),
      });
    setSubmitting(false);
    if (msgErr) return toast.error(msgErr.message);

    // Send Telegram notification
    const traderName = profile?.full_name || user.email || "Trader";
    await supabase.rpc("send_telegram", {
      p_message: `<b>New Support Ticket</b>\nTrader: ${traderName}\nSubject: ${subject.trim()}\nCategory: ${category}`,
    });

    toast.success("Ticket created");
    setShowNewForm(false);
    setSubject("");
    setCategory("");
    setMessage("");
    loadTickets();
  };

  const sendReply = async () => {
    if (!selectedTicket || !user) return;
    const text = replyText.trim();
    if (!text) return toast.error("Type a reply");
    setSendingReply(true);
    const { error } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: selectedTicket.id,
        sender_id: user.id,
        sender_role: "trader",
        message: text,
      });
    setSendingReply(false);
    if (error) return toast.error(error.message);
    setReplyText("");
    await loadMessages(selectedTicket.id);
    loadTickets();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Support</h1>
          <p className="text-sm text-muted-foreground">Get help from the FundedNG team</p>
        </div>
        <Button onClick={() => setShowNewForm(true)} className="font-display shrink-0">
          <Plus className="mr-1 h-4 w-4" /> New Ticket
        </Button>
      </div>

      {/* New Ticket Dialog */}
      <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
        <DialogContent className="mx-4 w-[calc(100%-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Create Support Ticket</DialogTitle>
            <DialogDescription>Describe your issue and our team will get back to you.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief title" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your issue in detail (min 20 characters)" />
              <p className="text-[11px] text-muted-foreground">{message.length}/20 characters</p>
            </div>
            <Button onClick={createTicket} disabled={submitting} className="font-display">
              {submitting ? "Submitting…" : "Submit Ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticket List */}
      {!selectedTicket && (
        <div className="mt-8 space-y-3">
          {tickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <LifeBuoy className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="font-display mt-3 text-base font-semibold">No tickets yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Click "New Ticket" above to get started.</p>
            </div>
          ) : tickets.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
              <div className="flex-1 min-w-[200px]">
                <div className="font-display font-semibold">{t.subject}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.category}</span>
                  <span>·</span>
                  <span>{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <Badge className={`font-display ${statusBadge[t.status] ?? ""}`}>
                {t.status === "in_progress" ? "In Progress" : t.status.charAt(0).toUpperCase() + t.status.slice(1)}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => openTicket(t)}>
                <MessageSquare className="mr-1 h-3 w-3" /> View
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Ticket Detail */}
      {selectedTicket && (
        <div className="mt-8">
          <button onClick={() => setSelectedTicket(null)} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to tickets
          </button>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">{selectedTicket.subject}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{selectedTicket.category}</span>
                  <span>·</span>
                  <span>Created {new Date(selectedTicket.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <Badge className={`font-display ${statusBadge[selectedTicket.status] ?? ""}`}>
                {selectedTicket.status === "in_progress" ? "In Progress" : selectedTicket.status.charAt(0).toUpperCase() + selectedTicket.status.slice(1)}
              </Badge>
            </div>

            {/* Messages Thread */}
            <div className="mt-6 space-y-4">
              {messages.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">Loading messages…</div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "trader" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-xl p-4 ${m.sender_role === "trader" ? "bg-muted" : "bg-primary/10 border border-primary/20"}`}>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-display font-semibold">{m.sender_role === "trader" ? "You" : "Admin"}</span>
                      <span>·</span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{m.message}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Input */}
            {selectedTicket.status !== "resolved" && (
              <div className="mt-6 flex items-end gap-3">
                <div className="flex-1">
                  <Textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply…"
                    className="min-h-[60px]"
                  />
                </div>
                <Button onClick={sendReply} disabled={sendingReply || !replyText.trim()} className="shrink-0">
                  <Send className="mr-1 h-4 w-4" /> {sendingReply ? "Sending…" : "Send"}
                </Button>
              </div>
            )}
            {selectedTicket.status === "resolved" && (
              <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                This ticket is resolved. <button onClick={() => { setSelectedTicket(null); setShowNewForm(true); }} className="text-primary underline">Create a new ticket</button> if you need further assistance.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
