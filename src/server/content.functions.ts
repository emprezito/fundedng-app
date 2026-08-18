import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "meta-llama/llama-4-scout";

const GenerateContentInput = z.object({
  accessToken: z.string().min(1),
  customPrompt: z.string().optional(),
});

async function assertAdmin(token: string) {
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return { ok: false as const, error: "Please sign in again" };
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roles) return { ok: false as const, error: "Not an admin" };
  return { ok: true as const, userId: authData.user.id };
}

async function gatherPlatformStats() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [accRes, payoutRes, orderRes, weekPayoutRes, recentPayouts, challenges] = await Promise.all([
    supabaseAdmin.from("trader_accounts").select("status, current_phase, starting_balance, current_equity, currency, created_at"),
    supabaseAdmin.from("payouts").select("amount_naira, status, created_at"),
    supabaseAdmin.from("orders").select("amount_paid, status, created_at"),
    supabaseAdmin.from("payouts").select("amount_naira").eq("status", "paid").gte("created_at", weekAgo),
    supabaseAdmin.from("payouts").select("amount_naira, status, created_at").eq("status", "paid").order("created_at", { ascending: false }).limit(5),
    supabaseAdmin.from("challenges").select("name, account_size, currency, is_active"),
  ]);

  const accounts = accRes.data ?? [];
  const payouts = payoutRes.data ?? [];
  const orders = orderRes.data ?? [];
  const weekPayouts = weekPayoutRes.data ?? [];

  const active = accounts.filter((a) => a.status === "active").length;
  const funded = accounts.filter((a) => a.status === "funded").length;
  const passed = accounts.filter((a) => a.status === "passed").length;
  const breached = accounts.filter((a) => a.status === "breached").length;
  const totalAccounts = accounts.length;

  const totalPaidNaira = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount_naira), 0);
  const weekPaidNaira = weekPayouts.reduce((s, p) => s + Number(p.amount_naira), 0);

  const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "delivered");
  const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.amount_paid), 0) / 100;
  const monthOrders = paidOrders.filter((o) => o.created_at >= monthAgo);
  const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.amount_paid), 0) / 100;

  const activeChallengeSizes = (challenges.data ?? [])
    .filter((c) => c.is_active)
    .map((c) => ({ name: c.name, size: c.account_size, currency: c.currency }));

  return {
    totalAccounts,
    active,
    funded,
    passed,
    breached,
    totalPaidNaira: Math.round(totalPaidNaira),
    weekPaidNaira: Math.round(weekPaidNaira),
    totalRevenue: Math.round(totalRevenue),
    monthRevenue: Math.round(monthRevenue),
    recentPayouts: (recentPayouts.data ?? []).map((p) => ({ amount: Number(p.amount_naira), date: p.created_at })),
    challenges: activeChallengeSizes,
    passRate: totalAccounts > 0 ? Math.round(((passed + funded) / totalAccounts) * 100) : 0,
  };
}

export const generateContentServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GenerateContentInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertAdmin(data.accessToken);
      if (!auth.ok) return auth;

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) return { ok: false as const, error: "OPENROUTER_API_KEY not set" };

      const stats = await gatherPlatformStats();

      const systemPrompt = `You are the social media manager for FundedNG, a prop trading firm based in Nigeria. You write engaging, authentic posts for X (formerly Twitter) that drive signups and build community.

Rules:
- Write like a real person, not a corporate bot. Use casual, confident Nigerian-English tone where appropriate.
- Keep each post under 280 characters for X (hard limit).
- Use relevant hashtags sparingly (1-3 per post max).
- Never make up specific trader names or amounts not in the data below.
- Mix formats: some posts as questions, some as statements, some as threads-ready hooks.
- Avoid emojis overload — 1-2 per post max.
- Never use the word "leverage" incorrectly.
- Focus on: results, education, community, platform features, motivation.
- You can reference real platform statistics provided below.
- Generate exactly 5 different posts, each offering a different angle or topic.
- Return ONLY valid JSON array, no markdown fences, no explanation.`;

      const statsContext = `Current platform data (real):
- Total traders: ${stats.totalAccounts}
- Active accounts: ${stats.active}
- Funded accounts: ${stats.funded}
- Passed accounts: ${stats.passed}
- Breached accounts: ${stats.breached}
- Pass rate: ${stats.passRate}%
- Total payouts: ₦${stats.totalPaidNaira.toLocaleString()}
- Payouts this week: ₦${stats.weekPaidNaira.toLocaleString()}
- Total revenue: ₦${stats.totalRevenue.toLocaleString()}
- Revenue this month: ₦${stats.monthRevenue.toLocaleString()}
- Recent payouts: ${stats.recentPayouts.map((p) => `₦${p.amount.toLocaleString()}`).join(", ") || "none yet"}
- Active challenges: ${stats.challenges.map((c) => `${c.name} (${c.currency} ${c.size?.toLocaleString()})`).join(", ")}`;

      const userPrompt = data.customPrompt
        ? `Generate 5 X posts about FundedNG. Custom direction from admin: "${data.customPrompt}"\n\nPlatform data:\n${statsContext}`
        : `Generate 5 engaging X posts for FundedNG using the platform data below. Each post should cover a different angle — results, trading tips, platform features, community engagement, or motivation. Make them feel authentic and conversion-focused.\n\n${statsContext}`;

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.9,
          max_tokens: 1024,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error("[generateContent] OpenRouter error:", res.status, errBody);
        return { ok: false as const, error: `OpenRouter API error: ${res.status}` };
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) return { ok: false as const, error: "No content returned from AI" };

      let posts: string[];
      try {
        const parsed = JSON.parse(content);
        posts = Array.isArray(parsed) ? parsed.map((p: any) => (typeof p === "string" ? p : p.content || p.text || JSON.stringify(p))) : [content];
      } catch {
        posts = content.split("\n\n").filter((p: string) => p.trim().length > 0);
      }

      return { ok: true as const, posts: posts.slice(0, 5), stats };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Content generation failed";
      console.error("[generateContentServer] unexpected", msg);
      return { ok: false as const, error: msg };
    }
  });
