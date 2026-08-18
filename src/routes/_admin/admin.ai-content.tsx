import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateContentServer } from "@/server/content.functions";
import { Sparkles, Copy, Check, Loader2, RefreshCw, Users, Banknote, TrendingUp, Activity } from "lucide-react";

export const Route = createFileRoute("/_admin/admin/ai-content")({
  component: AIContentPage,
});

interface PlatformStats {
  totalAccounts: number;
  active: number;
  funded: number;
  passed: number;
  breached: number;
  totalPaidNaira: number;
  weekPaidNaira: number;
  totalRevenue: number;
  monthRevenue: number;
  passRate: number;
}

function AIContentPage() {
  const [posts, setPosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);

  const handleGenerate = async (prompt?: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return toast.error("Please sign in again");

      const result = await generateContentServer({
        data: { accessToken: session.access_token, customPrompt: prompt || undefined },
      });

      if (!result || !result.ok) {
        toast.error(result?.error ?? "Failed to generate content");
        return;
      }

      setPosts(result.posts);
      if (result.stats) setStats(result.stats);
      toast.success(`Generated ${result.posts.length} posts`);
    } catch (e) {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const copyPost = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Content Generator
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate marketing posts for X using live platform data.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Users className="h-4 w-4" />} label="Traders" value={stats.totalAccounts} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Active" value={stats.active} />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Funded" value={stats.funded} />
          <StatCard icon={<Banknote className="h-4 w-4" />} label="Paid Out" value={`₦${stats.weekPaidNaira.toLocaleString()}`} sub="this week" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Direction (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="e.g. Write about our new trailing drawdown rule, or focus on-funded trader stories this week..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button onClick={() => handleGenerate(customPrompt || undefined)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {loading ? "Generating..." : posts.length > 0 ? "Regenerate" : "Generate Posts"}
            </Button>
            {posts.length > 0 && (
              <Button variant="outline" onClick={() => handleGenerate(undefined)} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Fresh Ideas
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {posts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Generated Posts</h2>
          {posts.map((post, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap flex-1">{post}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => copyPost(post, i)}
                  >
                    {copiedIdx === i ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">{post.length} / 280 chars</span>
                  <Button variant="ghost" size="sm" onClick={() => copyPost(post, i)}>
                    {copiedIdx === i ? "Copied!" : "Copy to clipboard"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
