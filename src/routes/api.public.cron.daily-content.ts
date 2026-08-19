import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramWithButtons } from "@/lib/telegram.server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openrouter/free";

/**
 * Public cron endpoint — called by pg_cron daily at 8am WAT.
 * Generates 5 marketing posts via AI and sends them to the admin via Telegram.
 */
export const Route = createFileRoute("/api/public/cron/daily-content")({
  server: {
    handlers: {
      POST: async () => dailyContent(),
      GET: async () => dailyContent(),
    },
  },
});

async function gatherPlatformStats() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [accRes, payoutRes, weekPayoutRes, challenges] = await Promise.all([
    supabaseAdmin.from("trader_accounts").select("status, current_phase"),
    supabaseAdmin.from("payouts").select("amount_naira, status"),
    supabaseAdmin.from("payouts").select("amount_naira").eq("status", "paid").gte("created_at", weekAgo),
    supabaseAdmin.from("challenges").select("name, account_size, currency, is_active"),
  ]);

  const accounts = accRes.data ?? [];
  const payouts = payoutRes.data ?? [];

  const active = accounts.filter((a) => a.status === "active").length;
  const funded = accounts.filter((a) => a.status === "funded").length;
  const passed = accounts.filter((a) => a.status === "passed").length;
  const totalAccounts = accounts.length;
  const totalPaidNaira = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount_naira), 0);
  const weekPaidNaira = (weekPayoutRes.data ?? []).reduce((s, p) => s + Number(p.amount_naira), 0);

  const activeChallengeSizes = (challenges.data ?? [])
    .filter((c) => c.is_active)
    .map((c) => ({ name: c.name, size: c.account_size, currency: c.currency }));

  return {
    totalAccounts,
    active,
    funded,
    passed,
    totalPaidNaira: Math.round(totalPaidNaira),
    weekPaidNaira: Math.round(weekPaidNaira),
    passRate: totalAccounts > 0 ? Math.round(((passed + funded) / totalAccounts) * 100) : 0,
    challenges: activeChallengeSizes,
  };
}

async function generatePosts(stats: Awaited<ReturnType<typeof gatherPlatformStats>>): Promise<string[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[daily-content] OPENROUTER_API_KEY not set");
    return [];
  }

  const systemPrompt = `You are the social media manager for FundedNG, a prop trading firm based in Nigeria. You write engaging, authentic posts for X (formerly Twitter) that drive signups and build community.

About FundedNG:
- FundedNG is Nigeria's leading prop trading firm. Website: fundedng.fun
- Traders get funded accounts (200k, 500k, 1M, 2M, 5M challenges available)
- Key selling points: No trailing drawdown. No consistency rule. 24-hour payouts. Up to 90% profit split.
- Traders trade on Exness MT5 with real capital
- 2-phase challenge system: pass Phase 1 and Phase 2 to get funded
- Payouts in Naira via bank transfer or USDT

Rules for writing posts:
- Write like a real person, not a corporate bot. Use casual, confident Nigerian-English tone where appropriate.
- Use relevant hashtags sparingly (1-3 per post max).
- Never make up specific trader names or amounts not in the data provided.
- Mix it up: some posts as questions to the audience, some as bold statements, some as calls-to-action, some as tips.
- Avoid emoji overload — 1-2 per post max.
- Prioritize promoting FundedNG's features, benefits, and why traders should join. Stats are supporting evidence, not the main content.
- Every post should make someone want to visit fundedng.fun and sign up.
- Write substantial, detailed posts — no character limit. Write as much as needed to make the post compelling.
- Generate exactly 5 different posts, each completely different in angle and tone.
- Return ONLY a valid JSON array of strings, no markdown fences, no explanation.`;

  const statsContext = `Real platform data (use as supporting evidence, not as the main content):
- Total traders: ${stats.totalAccounts}
- Active accounts: ${stats.active}
- Funded accounts: ${stats.funded}
- Total payouts paid: ₦${stats.totalPaidNaira.toLocaleString()}
- Payouts this week: ₦${stats.weekPaidNaira.toLocaleString()}
- Pass rate: ${stats.passRate}%
- Active challenges: ${stats.challenges.map((c) => `${c.name} (${c.currency} ${c.size?.toLocaleString()})`).join(", ")}`;

  const userPrompt = `Generate 5 X posts for FundedNG. Mix these angles across the 5 posts:
1. A call-to-action post promoting a specific FundedNG feature (no trailing drawdown, no consistency rule, 24hr payouts, or profit split)
2. A question engaging the trading community
3. A motivational or results-driven post using the platform stats
4. A tip or educational post about prop trading
5. A bold statement or hot take about why FundedNG is different

Make them feel like a real trader talking to other traders. Drive traffic to fundedng.fun.

Platform data:
${statsContext}`;

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
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    console.error("[daily-content] OpenRouter error:", res.status);
    return [];
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed)
      ? parsed.map((p: any) => (typeof p === "string" ? p : p.content || p.text || JSON.stringify(p))).slice(0, 5)
      : [content];
  } catch {
    return content.split("\n\n").filter((p: string) => p.trim().length > 0).slice(0, 5);
  }
}

function formatTelegramMessage(posts: string[], date: string): string {
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
  let msg = `📝 <b>FundedNG Daily Content — ${date}</b>\n\n`;
  posts.forEach((post, i) => {
    msg += `${emojis[i] ?? `${i + 1}.`}\n${post}\n\n`;
  });
  msg += `Generate more → fundedng.fun/admin/ai-content`;
  return msg;
}

async function dailyContent() {
  const startedAt = Date.now();

  try {
    const stats = await gatherPlatformStats();
    const posts = await generatePosts(stats);

    if (posts.length === 0) {
      return Response.json({ ok: false, error: "No posts generated" }, { status: 500 });
    }

    const date = new Date().toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const message = formatTelegramMessage(posts, date);
    await sendTelegramWithButtons(message, []);

    await supabaseAdmin.from("daily_content").insert({
      posts,
      stats,
    });

    return Response.json({ ok: true, posts: posts.length, ms: Date.now() - startedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[daily-content] error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
