import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/site/PublicHeader";
import { Brand } from "@/components/site/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Handshake,
  TrendingUp,
  Users,
  Wallet,
  Megaphone,
  Gift,
  ShieldCheck,
  ArrowRight,
  BarChart3,
  Zap,
  CheckCircle2,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/partners")({
  head: () => ({
    meta: [
      { title: "Partner Program — FundedNG" },
      {
        name: "description",
        content:
          "Partner with FundedNG — Nigeria's fastest-growing prop trading firm. Earn commissions, grow your brand, and help traders get funded.",
      },
      { property: "og:title", content: "Partner Program — FundedNG" },
      {
        property: "og:description",
        content:
          "Earn commissions, grow your brand, and help traders get funded. Join the FundedNG Partner Program today.",
      },
    ],
  }),
  component: PartnersPage,
});

const BENEFITS = [
  {
    icon: Wallet,
    title: "Earn Commissions",
    description:
      "Earn on every trader you refer. Your unique promo code tracks every sale — payouts are transparent and on time.",
  },
  {
    icon: Megaphone,
    title: "Grow Your Brand",
    description:
      "Align with Nigeria's fastest-growing prop firm. Access co-branded content, early product drops, and a dedicated partner manager.",
  },
  {
    icon: Gift,
    title: "Exclusive Perks",
    description:
      "Get free challenge accounts, discounted pricing for your community, and early access to new features before public launch.",
  },
  {
    icon: Users,
    title: "Community Support",
    description:
      "Join a private partner community. Share strategies, get support, and connect with other FundedNG partners across Nigeria.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Dashboard",
    description:
      "Track your referrals, commissions, and payout history from your partner dashboard. Full transparency, always.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted Platform",
    description:
      "FundedNG is built for Nigerian traders. MT5 execution, Naira payouts within 24 hours, and a growing community of funded traders.",
  },
];

const STEPS = [
  {
    step: "01",
    icon: Megaphone,
    title: "Apply to Partner",
    description:
      "Fill out the partner application. Tell us about your audience, your content, and why FundedNG is a fit.",
  },
  {
    step: "02",
    icon: ShieldCheck,
    title: "We Review",
    description:
      "Our team reviews every application within 3–5 business days. We look at your reach, content quality, and alignment with our brand.",
  },
  {
    step: "03",
    icon: Zap,
    title: "Get Onboarded",
    description:
      "Approved partners get a unique promo code, access to the partner dashboard, and a dedicated partner manager.",
  },
  {
    step: "04",
    icon: TrendingUp,
    title: "Grow & Earn",
    description:
      "Share your promo code, document your funded journey, and earn commissions on every trader you refer.",
  },
];

const REQUIREMENTS = [
  "Genuine trading content or community — not giveaway-only accounts",
  "Willingness to attempt and publicly document a FundedNG challenge",
  "Minimum 2 pieces of FundedNG content per month",
  "No false claims about the platform or misleading your audience",
  "All communication through official FundedNG support channels",
];

export default function PartnersPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-surface">
        <div className="absolute inset-0 gradient-radial-primary opacity-30" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center md:px-6">
          <Badge
            variant="outline"
            className="font-display border-primary/40 text-primary"
          >
            PARTNER PROGRAM
          </Badge>
          <h1 className="font-display mt-4 text-5xl font-bold leading-tight md:text-6xl">
            Partner with{" "}
            <span className="text-primary text-glow">FundedNG</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Earn commissions, grow your brand, and help Nigerian traders get
            funded. Join the fastest-growing prop trading partner network in
            West Africa.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/partner-apply">
              <Button size="lg" className="font-display animate-pulse-glow">
                Apply Now <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button
                size="lg"
                variant="outline"
                className="font-display"
              >
                How It Works
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px md:grid-cols-4">
          {[
            { value: "80%", label: "Profit Split" },
            { value: "24h", label: "Payout Speed" },
            { value: "₦2M", label: "Max Funding" },
            { value: "3", label: "Simple Rules" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center bg-card px-4 py-8"
            >
              <div className="font-display text-3xl font-bold text-primary">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Partner */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge
              variant="outline"
              className="font-display border-primary/40 text-primary"
            >
              WHY PARTNER
            </Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">
              Built for partners who{" "}
              <span className="text-primary">build communities</span>
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Whether you're a trading educator, signal provider, or community
              leader — FundedNG gives you the tools to monetize your audience
              while genuinely helping traders succeed.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:glow-primary"
              >
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5 w-fit">
                  <b.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display mt-4 text-lg font-semibold">
                  {b.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {b.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge
              variant="outline"
              className="font-display border-primary/40 text-primary"
            >
              HOW IT WORKS
            </Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">
              From application to{" "}
              <span className="text-primary">first commission</span>
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.step} className="relative text-center">
                {i < STEPS.length - 1 && (
                  <div className="absolute left-1/2 top-8 hidden h-px w-full bg-border md:block" />
                )}
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/40 bg-card">
                  <s.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="font-display mt-4 text-xs font-bold tracking-widest text-primary">
                  STEP {s.step}
                </div>
                <h3 className="font-display mt-2 text-lg font-semibold">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge
              variant="outline"
              className="font-display border-gold/40 text-gold"
            >
              PARTNER STANDARDS
            </Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">
              What we expect from partners
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              These aren't just rules — they're the foundation of trust between
              FundedNG, our partners, and the traders they influence.
            </p>
          </div>

          <div className="mt-10 rounded-xl border border-border bg-card p-6">
            <ul className="space-y-4">
              {REQUIREMENTS.map((r) => (
                <li key={r} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm text-muted-foreground">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 rounded-xl border border-gold/30 bg-gold/5 p-5">
            <div className="flex items-start gap-3">
              <Star className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
              <div>
                <h4 className="font-display text-sm font-semibold text-gold">
                  Non-Negotiable
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every approved partner must publicly attempt and document a
                  FundedNG challenge. This builds credibility with your audience
                  and proves you stand behind the platform.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-20 md:px-6">
          <div className="text-center">
            <Badge
              variant="outline"
              className="font-display border-primary/40 text-primary"
            >
              FAQ
            </Badge>
            <h2 className="font-display mt-4 text-4xl font-bold">
              Common questions
            </h2>
          </div>

          <div className="mt-10 space-y-4">
            {[
              {
                q: "How much can I earn?",
                a: "You earn a commission on every trader who purchases a challenge using your promo code. Commission rates are disclosed during onboarding and scale with your referral volume.",
              },
              {
                q: "Do I need to be a trader to partner?",
                a: "Not necessarily. If you have an engaged audience interested in prop trading, you can partner. However, publicly documenting a FundedNG challenge is a requirement for all partners.",
              },
              {
                q: "How long does the review take?",
                a: "We review applications within 3–5 business days. We'll reach out via email if we need more information. All communication happens through official support channels — never by DM.",
              },
              {
                q: "Can I partner with other prop firms?",
                a: "Yes, but we value exclusivity. Partners who promote multiple prop firms should disclose this during their application. FundedNG should be your primary focus.",
              },
              {
                q: "How do I get paid?",
                a: "Commissions are tracked in your partner dashboard. Payouts are processed to your verified bank account. Details are shared during onboarding.",
              },
            ].map((faq) => (
              <div
                key={faq.q}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h4 className="font-display text-sm font-semibold">
                  {faq.q}
                </h4>
                <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
          <Handshake className="mx-auto h-12 w-12 text-primary" />
          <h2 className="font-display mt-4 text-4xl font-bold">
            Ready to grow with FundedNG?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Applications are reviewed within 3–5 business days. If you're
            serious about building a partnership that benefits your audience —
            we'd love to hear from you.
          </p>
          <Link to="/partner-apply" className="mt-8 inline-block">
            <Button size="lg" className="font-display">
              Apply to Partner <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 text-center md:px-6">
        <Brand />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <Link
            to="/"
            className="text-muted-foreground hover:text-primary"
          >
            Home
          </Link>
          <Link
            to="/rules"
            className="text-muted-foreground hover:text-primary"
          >
            Rules
          </Link>
          <Link
            to="/agreement"
            className="text-muted-foreground hover:text-primary"
          >
            Agreement & Risk
          </Link>
          <Link
            to="/partners"
            className="text-muted-foreground hover:text-primary"
          >
            Partners
          </Link>
        </div>
        <div className="mt-4 text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} FundedNG. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
