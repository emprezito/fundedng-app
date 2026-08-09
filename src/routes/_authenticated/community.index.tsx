import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Users, MessageCircle, ArrowRight, Lock } from "lucide-react";
import { useHasPurchase } from "@/hooks/use-has-purchase";

export const Route = createFileRoute("/_authenticated/community/")({ component: CommunityPage });

interface Group {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  member_count?: number;
  is_member?: boolean;
}

function CommunityPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const hasPurchase = useHasPurchase();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const [{ data: gs }, { data: ms }] = await Promise.all([
      supabase.from("community_groups").select("*").eq("is_active", true).order("created_at"),
      supabase.from("group_members").select("group_id, user_id"),
    ]);
    const memberMap = new Map<string, number>();
    const myGroups = new Set<string>();
    (ms ?? []).forEach((m) => {
      memberMap.set(m.group_id, (memberMap.get(m.group_id) ?? 0) + 1);
      if (m.user_id === user.id) myGroups.add(m.group_id);
    });
    setGroups(
      ((gs as Group[]) ?? []).map((g) => ({
        ...g,
        member_count: memberMap.get(g.id) ?? 0,
        is_member: myGroups.has(g.id),
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const join = async (groupId: string) => {
    if (!user) {
      toast.error("Please sign in to join groups.");
      return;
    }
    if (!hasPurchase) {
      toast.error("Purchase a challenge to join groups.");
      return;
    }
    // Optimistic UI: immediately mark joined so the button updates
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, is_member: true, member_count: (g.member_count ?? 0) + 1 }
          : g
      )
    );
    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: user.id });
    if (error) {
      // Already a member is fine — keep optimistic state and open chat
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        const slug = groups.find((g) => g.id === groupId)?.slug;
        if (slug) open_chat(slug);
        return;
      }
      console.error("Join group failed", error);
      toast.error(error.message || "Could not join group");
      load();
      return;
    }
    toast.success("Joined group");
    const slug = groups.find((g) => g.id === groupId)?.slug;
    if (slug) open_chat(slug);
  };

  const open_chat = (slug: string) => navigate({ to: "/community/$slug", params: { slug } });

  const createGroup = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const slug = newName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);
    const { error } = await supabase
      .from("community_groups")
      .insert({ name: newName.trim(), slug, description: newDesc.trim() || null, created_by: user!.id });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Group created");
    setNewName("");
    setNewDesc("");
    setOpen(false);
    load();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Community</h1>
          <p className="text-sm text-muted-foreground">Chat with other Nigerian traders.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="font-display">
                <Plus className="mr-1 h-4 w-4" /> New group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a community group</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Group name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Textarea placeholder="What's this group about?" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              </div>
              <DialogFooter>
                <Button onClick={createGroup} disabled={creating || !newName.trim()}>
                  {creating ? "Creating…" : "Create group"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {hasPurchase === false && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <div className="font-display text-sm font-semibold">Read-only mode</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Purchase a challenge to join the conversation and post in the community.
            </p>
          </div>
          <Link to="/buy">
            <Button size="sm" className="font-display">
              Buy now <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading groups…</p>
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <Card key={g.id} className="transition-colors hover:border-primary/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="font-display text-lg">{g.name}</CardTitle>
                  {g.is_member && <Badge variant="outline" className="text-[10px]">Joined</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" /> {g.member_count} members
                  </div>
                  {g.is_member ? (
                    <Button size="sm" variant="default" onClick={() => open_chat(g.slug)}>
                      <MessageCircle className="mr-1 h-4 w-4" /> Open chat
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => (hasPurchase ? join(g.id) : open_chat(g.slug))}
                    >
                      {hasPurchase ? <>Join <ArrowRight className="ml-1 h-3 w-3" /></> : <>View <ArrowRight className="ml-1 h-3 w-3" /></>}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">No groups yet. {isAdmin && "Create one above."}</p>
          )}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link to="/dashboard" className="underline">Back to dashboard</Link>
      </p>
    </div>
  );
}