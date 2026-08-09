import { createFileRoute } from "@tanstack/react-router";
import { useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/tickets")({
  component: TicketsPage,
});

function TicketsPage() {
  const {
    tickets, selectedTicket, ticketMessages, replyText, replySaving, statusFilter, statusUpdating,
    setReplyText, setStatusFilter, selectTicket, closeTicketDetail, sendAdminReply, updateTicketStatus, statusFlow,
  } = useAdminData();

  return (
    <div className="mt-6">
      <h2 className="font-display text-xl font-bold mb-4">Support Tickets</h2>
      {!selectedTicket ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {["all", "open", "in_progress", "resolved"].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-display font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? "All" : s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {tickets.filter((t) => statusFilter === "all" || t.status === statusFilter).length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No support tickets yet.</div>
            ) : tickets.filter((t) => statusFilter === "all" || t.status === statusFilter).map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold">{t.subject}</div>
                    <div className="text-xs text-muted-foreground">{t.profiles?.full_name ?? "—"} · {t.category} · {new Date(t.created_at).toLocaleString()}</div>
                  </div>
                  <Badge variant="outline" className={`font-display ${t.status === "open" ? "border-warning/40 text-warning" : t.status === "in_progress" ? "border-info/40 text-info" : "border-primary/40 text-primary"}`}>
                    {t.status === "in_progress" ? "IN PROGRESS" : t.status.toUpperCase()}
                  </Badge>
                  <div className="text-xs text-muted-foreground">Updated {new Date(t.updated_at).toLocaleDateString()}</div>
                  <Button size="sm" variant="outline" onClick={() => selectTicket(t)}>View</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          <button onClick={closeTicketDetail} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to all tickets
          </button>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">{selectedTicket.subject}</h2>
                <div className="mt-1 text-xs text-muted-foreground">{selectedTicket.profiles?.full_name ?? "—"} · {selectedTicket.category} · Created {new Date(selectedTicket.created_at).toLocaleString()}</div>
              </div>
              <Badge variant="outline" className={`font-display ${selectedTicket.status === "open" ? "border-warning/40 text-warning" : selectedTicket.status === "in_progress" ? "border-info/40 text-info" : "border-primary/40 text-primary"}`}>
                {selectedTicket.status === "in_progress" ? "IN PROGRESS" : selectedTicket.status.toUpperCase()}
              </Badge>
            </div>

            <div className="mt-6 space-y-4">
              {ticketMessages.length === 0 && (<div className="py-6 text-center text-sm text-muted-foreground">No messages yet.</div>)}
              {ticketMessages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "trader" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-xl p-4 ${m.sender_role === "trader" ? "bg-muted" : "bg-primary/10 border border-primary/20"}`}>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-display font-semibold">{m.sender_role === "trader" ? selectedTicket.profiles?.full_name ?? "Trader" : "Admin"}</span>
                      <span>·</span><span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{m.message}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <Label htmlFor="admin-reply" className="text-[10px] uppercase tracking-wide text-muted-foreground">Reply as Admin</Label>
                <Textarea id="admin-reply" rows={2} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Type your reply…" className="mt-1" />
              </div>
              <div className="flex flex-wrap gap-2">
                {(statusFlow[selectedTicket.status] ?? []).map((nextStatus) => (
                  <Button key={nextStatus} size="sm" variant={nextStatus === "resolved" ? "default" : "outline"}
                    onClick={() => updateTicketStatus(selectedTicket, nextStatus)} disabled={statusUpdating === selectedTicket.id}>
                    {statusUpdating === selectedTicket.id ? "…" : `Mark ${nextStatus.replace("_", " ")}`}
                  </Button>
                ))}
                <Button size="sm" onClick={sendAdminReply} disabled={replySaving || !replyText.trim()}>{replySaving ? "Sending…" : "Send Reply"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
