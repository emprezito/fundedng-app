import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicHeader } from "@/components/site/PublicHeader";
import { Brand } from "@/components/site/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ScrollText, AlertTriangle, Wallet, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/agreement")({
  head: () => ({
    meta: [
      { title: "Trader Agreement & Risk Disclosure — FundedNG" },
      { name: "description", content: "FundedNG terms of service, trader agreement, and risk disclosure for prop trading challenges." },
      { property: "og:title", content: "Trader Agreement & Risk Disclosure — FundedNG" },
      { property: "og:description", content: "Read the FundedNG terms, trader agreement, and risk disclosure before purchasing a challenge." },
    ],
  }),
  component: AgreementPage,
});

function Section({ icon: Icon, title, children }: { icon: typeof ScrollText; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 md:p-8">
      <div className="flex items-center gap-3">
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="font-display text-xl font-bold md:text-2xl">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function AgreementPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-border bg-surface">
        <div className="absolute inset-0 gradient-radial-primary opacity-20" />
        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center md:px-6 md:py-20">
          <Badge variant="outline" className="font-display border-primary/40 text-primary">LEGAL</Badge>
          <h1 className="font-display mt-4 text-4xl font-bold leading-tight md:text-5xl">
            Trader Agreement & <span className="text-primary text-glow">Risk Disclosure</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Last updated: {new Date().toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}.
            Please read these terms carefully before purchasing a challenge.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-12 md:px-6 md:py-16">
        <Section icon={ScrollText} title="1. About FundedNG">
          <p>
            FundedNG ("we", "us", "our") is a Nigerian proprietary trading evaluation
            platform. We provide MT5 evaluation accounts on the FundedNG server and
            assess traders' performance against published rules. Successful traders
            receive payouts denominated in Naira from our company funds, calculated as
            a percentage of the evaluation profits achieved.
          </p>
          <p>
            FundedNG is not a broker, not a deposit-taking institution, and does not
            execute live market orders on behalf of users.
          </p>
        </Section>

        <Section icon={ShieldCheck} title="2. Trader Agreement">
          <p>
            By purchasing a challenge you agree to trade only on the MT5 evaluation
            account provisioned by FundedNG, to follow all published rules (see{" "}
            <Link to="/rules" className="text-primary hover:underline">/rules</Link>),
            and to refrain from any prohibited strategies including but not limited
            to tick scalping (closing trades in less than 3 minutes regardless of close type — 3 warnings then breach on 4th),
            position stacking (opening more than 2 positions on a single symbol), averaging into losing positions,
            cross-account hedging, copy trading from a third party, undisclosed
            expert advisors, any form of price manipulation, and creating or
            using multiple accounts to participate in free giveaway challenges
            or promotions.
          </p>
          <p>
            You agree that the challenge fee is a one-time service fee for the
            evaluation and is non-refundable once the MT5 account credentials have
            been delivered. If we are unable to deliver an account within 24 hours
            of payment, you are entitled to a full refund.
          </p>
          <p>
            You agree that all payouts are processed only to the bank account on
            file with KYC-verified details that match your registered name. We
            reserve the right to delay or decline a payout if the rules were
            breached, if KYC is incomplete, or if there is a reasonable suspicion of
            fraud, account sharing, or coordinated trading across users.
          </p>
        </Section>

        <Section icon={AlertTriangle} title="3. Risk Disclosure">
          <p>
            Trading foreign exchange, CFDs, indices and crypto carries a high level
            of risk. While FundedNG accounts are simulated and you cannot lose real
            money on the platform, the skills you practise here may not translate
            into live-market profits, and any decision to trade live capital after
            participating in our evaluation is entirely your own responsibility.
          </p>
          <p>
            Past performance — yours, ours, or any other trader's — does not
            guarantee future results. Profit targets, drawdown limits, and payout
            multiples are illustrative of the evaluation rules and not promises of
            future earnings. There is no guarantee that you will pass an
            evaluation, become funded, or receive any payout.
          </p>
        </Section>

        <Section icon={Wallet} title="4. Payouts & KYC">
          <p>
            Funded traders keep 80% of evaluation profits, paid in Naira. Payouts are
            processed within 24 hours of approval, with a 7-day cycle between requests,
            to a verified Nigerian bank account.
          </p>
          <p>
            We require basic KYC — your full legal name, phone number, and a
            10-digit NUBAN bank account whose holder name matches your trader
            account. We do not request additional documents unless we receive a
            specific compliance request from a regulator.
          </p>
        </Section>

        <Section icon={ScrollText} title="5. Termination">
          <p>
            We may close any account that breaches the trading rules, attempts to
            circumvent the evaluation, or engages in abusive behaviour in our
            community channels. Gaming the system — including using multiple
            accounts for free giveaways or promotions — will result in all
            associated accounts being permanently terminated. In serious cases
            of fraud or attempted fraud we reserve the right to forfeit any
            pending payouts and ban the user from future challenges.
          </p>
          <p>You may terminate your account at any time by contacting support.</p>
        </Section>

        <Section icon={ScrollText} title="6. Liability">
          <p>
            FundedNG's total aggregate liability to any single user is limited to
            the amount that user has paid us in challenge fees during the 12 months
            preceding the claim. We are not liable for any indirect, incidental, or
            consequential damages.
          </p>
        </Section>

        <Section icon={ScrollText} title="7. Governing Law">
          <p>
            This agreement is governed by the laws of the Federal Republic of
            Nigeria. Any dispute will be resolved exclusively in the courts of
            Lagos State.
          </p>
        </Section>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            By purchasing a FundedNG challenge you confirm that you have read,
            understood, and agreed to this entire document.
          </p>
          <Link to="/buy" className="mt-4 inline-block">
            <Button className="font-display">
              I agree — pick a challenge <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <footer className="border-t border-border px-4 py-12 text-center md:px-6">
        <Brand />
        <div className="mt-4 text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} FundedNG. All rights reserved.
        </div>
      </footer>
    </div>
  );
}