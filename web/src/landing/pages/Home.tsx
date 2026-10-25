// The landing page (docs/ux-plan.md §5.1). Prerendered; the live numbers,
// campaigns and payouts are filled in by client.ts.
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  ChevronDown,
  CircleCheck,
  FileCode,
  FingerprintPattern,
  HandCoins,
  Lock,
  Megaphone,
  Receipt,
  Scale,
  ScanEye,
  Video,
} from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import { buttonVariants } from "@/components/ui/button";
import { config, explorer } from "@/lib/network";
import { cn } from "@/lib/utils";
import { Container } from "../Shell";
import { CampaignCardSkeleton, CampaignCardTemplate, PayoutRowSkeleton, PayoutRowTemplate } from "../Templates";

const feePct = `${config.feeBps / 100}%`;
const keepPct = `${100 - config.feeBps / 100}%`;
const contractUrl = explorer.account(config.contractId);
const grace = `${Math.round(config.settleGrace / 60)} minutes`;

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold tracking-wide text-primary uppercase">{children}</p>;
}

function SectionHeading({ eyebrow, title, sub, id }: { eyebrow: string; title: string; sub?: string; id?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-4 text-lg text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_70%_-10%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_70%),radial-gradient(40rem_24rem_at_0%_20%,color-mix(in_oklch,var(--money)_10%,transparent),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_65%)] bg-[size:48px_48px] opacity-60"
      />
      <Container className="grid grid-cols-1 items-center gap-12 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24">
        <div>
          <a
            href="/security"
            className="inline-flex items-center gap-2 rounded-full border bg-background/70 py-1 pr-3 pl-1 text-sm text-muted-foreground shadow-xs backdrop-blur transition-colors hover:text-foreground"
          >
            <span className="rounded-full bg-money-soft px-2 py-0.5 text-xs font-semibold text-money">Live</span>
            Escrowed by a Stellar smart contract
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
          <h1
            id="hero-title"
            className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl lg:leading-[1.05]"
          >
            Pay creators for views that <span className="text-primary">actually happen</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
            Brands lock a budget and set a rate per 1,000 views. Creators post clips, and the contract pays them
            as their views are verified — in minutes, not months.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="/new" className={buttonVariants({ size: "lg", className: "h-11 px-6 text-base" })}>
              <Megaphone aria-hidden="true" />
              Launch a campaign
            </a>
            <a
              href="/campaigns"
              className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-6 text-base" })}
            >
              Find paid campaigns
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
          <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
            {[
              "Pay only for verified views",
              "Unspent budget refunds to you",
              "Sign in with a passkey, no seed phrase",
              "Every payout is on-chain",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <ProductPreview />
      </Container>
    </section>
  );
}

/** The hero's product shot: a real campaign and its latest payouts. */
function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-money/15 blur-2xl"
      />
      <div className="rounded-2xl border bg-background/60 p-3 shadow-xl backdrop-blur sm:p-4">
        <div className="flex items-center justify-between px-1 pb-3 text-xs text-muted-foreground">
          <h2 className="font-medium">Featured campaign</h2>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-ok" />
            </span>
            Live data
          </span>
        </div>
        <div data-list="hero-campaign">
          <CampaignCardSkeleton />
        </div>
        <div className="mt-3 rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between px-2 pb-1">
            <h2 className="text-sm font-semibold">Latest payouts</h2>
            <span className="text-xs text-muted-foreground">across all campaigns</span>
          </div>
          <ul data-list="hero-payouts" aria-live="polite" className="divide-y divide-border/60">
            {[0, 1, 2, 3].map((i) => (
              <PayoutRowSkeleton key={i} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatsBand() {
  const stats = [
    { key: "locked", label: "Budget in escrow", unit: config.tokenSymbol },
    { key: "paid", label: "Paid to creators", unit: config.tokenSymbol },
    { key: "views", label: "Verified views", unit: null },
    { key: "creators", label: "Creators paid", unit: null },
  ];
  return (
    <section aria-labelledby="stats-title" className="border-y bg-muted/40">
      <Container className="py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="stats-title" className="text-sm font-medium text-muted-foreground">
            Live on Stellar testnet
            <span data-stat="updated" className="ml-2 text-xs" />
          </h2>
          <a
            href={contractUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Check every number on-chain
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.key} className="bg-card p-5">
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 flex items-baseline gap-1.5">
                <span data-stat={s.key} className="tabular text-3xl font-semibold tracking-tight">
                  —
                </span>
                {s.unit && <span className="text-sm text-muted-foreground">{s.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function Audience({
  id,
  icon,
  eyebrow,
  title,
  points,
  cta,
}: {
  id: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  points: { icon: ReactNode; title: string; text: string }[];
  cta: ReactNode;
}) {
  return (
    <div id={id} className="flex scroll-mt-24 flex-col rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-5">
        {icon}
      </div>
      <Eyebrow>
        <span className="mt-5 block">{eyebrow}</span>
      </Eyebrow>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h3>
      <ul className="mt-6 space-y-5">
        {points.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="mt-0.5 text-primary [&_svg]:size-5">{p.icon}</span>
            <div>
              <p className="font-medium">{p.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-8 pt-2 sm:mt-auto">{cta}</div>
    </div>
  );
}

function Audiences() {
  return (
    <section aria-labelledby="audiences-title" className="py-20 sm:py-24">
      <Container>
        <SectionHeading
          id="audiences-title"
          eyebrow="Two sides, one contract"
          title="Built for brands that want reach and creators who want to get paid"
        />
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Audience
            id="brands"
            icon={<Megaphone aria-hidden="true" />}
            eyebrow="For brands"
            title="Spend on views, not promises"
            points={[
              {
                icon: <ScanEye aria-hidden="true" />,
                title: "Pay per verified view",
                text: "Set a rate per 1,000 views and a cap per creator. You never pay for views that didn't happen.",
              },
              {
                icon: <Lock aria-hidden="true" />,
                title: "Your budget, held in escrow",
                text: "Funds sit in the ClipPay contract and only move to creators or back to you. Refund the rest after the deadline.",
              },
              {
                icon: <Receipt aria-hidden="true" />,
                title: "An audit trail for every payout",
                text: "Each payment is a public Stellar transaction recording the views it paid for.",
              },
            ]}
            cta={
              <a href="/new" className={buttonVariants({ size: "lg" })}>
                Launch a campaign
                <ArrowRight aria-hidden="true" />
              </a>
            }
          />
          <Audience
            id="creators"
            icon={<Video aria-hidden="true" />}
            eyebrow="For creators"
            title="Get paid while your views climb"
            points={[
              {
                icon: <FingerprintPattern aria-hidden="true" />,
                title: "Sign in with Face ID or a fingerprint",
                text: "A passkey wallet is created for you. No seed phrase, no extension, and network fees are covered.",
              },
              {
                icon: <HandCoins aria-hidden="true" />,
                title: "Paid in minutes, not net-60",
                text: `Views are checked every minute and paid straight to your wallet. You keep ${keepPct} of the rate.`,
              },
              {
                icon: <Banknote aria-hidden="true" />,
                title: "Cash out to your bank",
                text: "Withdraw through a Stellar anchor that pays out locally (a test anchor on testnet).",
              },
            ]}
            cta={
              <a href="/campaigns" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Browse campaigns
                <ArrowRight aria-hidden="true" />
              </a>
            }
          />
        </div>
      </Container>
    </section>
  );
}

function Steps() {
  const steps = [
    {
      title: "A brand locks a budget",
      text: "They set a rate per 1,000 views, a cap per creator and a deadline. The budget goes into the contract, not to ClipPay.",
    },
    {
      title: "Creators post and submit",
      text: "Make a clip that follows the brief, post it with your campaign tag, and submit the link.",
    },
    {
      title: "Views become payouts",
      text: "The verifier checks views every minute and the contract pays creators directly. Unspent budget goes back to the brand.",
    },
  ];
  return (
    <section aria-labelledby="steps-title" className="border-y bg-muted/40 py-20 sm:py-24">
      <Container>
        <SectionHeading id="steps-title" eyebrow="How it works" title="Three steps from brief to payout" />
        <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border bg-card p-6 shadow-sm">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular">
                {i + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-center">
          <a href="/how-it-works" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Read the details
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </p>
      </Container>
    </section>
  );
}

function LiveCampaigns() {
  return (
    <section aria-labelledby="live-title" className="py-20 sm:py-24">
      <Container>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Open now</Eyebrow>
            <h2 id="live-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Campaigns paying right now
            </h2>
          </div>
          <a href="/campaigns" className={buttonVariants({ variant: "outline" })}>
            View all campaigns
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
        <div data-list="campaigns" className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
        <p data-empty="campaigns" hidden className="mt-10 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          No campaigns are open right now.{" "}
          <a href="/new" className="font-medium text-primary hover:underline">
            Launch the first one
          </a>
          .
        </p>
      </Container>
    </section>
  );
}

function Trust() {
  const items = [
    {
      icon: <Lock aria-hidden="true" />,
      title: "Escrow with hard limits",
      text: "A budget can only go to creators, at the campaign's rate and up to each creator's cap, or back to the brand.",
    },
    {
      icon: <FileCode aria-hidden="true" />,
      title: "Open source",
      text: "Contract, verifier and app are public, with property tests that check no funds are ever created or lost.",
    },
    {
      icon: <BadgeCheck aria-hidden="true" />,
      title: "Verifiable payouts",
      text: "Every payout, fee and refund is a contract event on Stellar that anyone can inspect.",
    },
    {
      icon: <Scale aria-hidden="true" />,
      title: "A fee you can read in the code",
      text: `ClipPay takes ${feePct} of each payout — nothing on deposits or refunds. The contract caps it at 20%.`,
    },
  ];
  return (
    <section aria-labelledby="trust-title" className="border-y bg-muted/40 py-20 sm:py-24">
      <Container>
        <SectionHeading
          id="trust-title"
          eyebrow="Trust, but verify"
          title="Your money follows rules anyone can check"
          sub="ClipPay is built so brands and creators don't have to take our word for it."
        />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">
                {it.icon}
              </div>
              <h3 className="mt-4 font-semibold">{it.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{it.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={contractUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            View the contract
            <ArrowUpRight aria-hidden="true" />
          </a>
          <a href="/security" className={buttonVariants({ variant: "outline" })}>
            Security model
          </a>
          <a href={config.repoUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            <GithubMark />
            Source on GitHub
          </a>
        </div>
      </Container>
    </section>
  );
}

export const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Is this real money?",
    a: "Not yet. ClipPay runs on Stellar's test network, where XLM is free from a faucet and has no value. Everything else — the contract, wallets, payouts and cash-out flow — works as it would on mainnet.",
  },
  {
    q: "How are views verified?",
    a: "A verifier service reads each post's public view count from the platform and checks that the post follows the brief, such as including your campaign tag. The demo campaigns use simulated view counts so you can watch payouts arrive.",
  },
  {
    q: "When do creators get paid?",
    a: `While a campaign is live, views are checked about once a minute and each check pays for the new ones. Checks continue for ${grace} after the deadline, then the campaign settles.`,
  },
  {
    q: "What does ClipPay charge?",
    a: `${feePct} of each payout, so creators receive ${keepPct} of the campaign's rate. Deposits and refunds are free, and the contract won't accept a fee above 20%.`,
  },
  {
    q: "What happens to unspent budget?",
    a: `It stays in the contract until the campaign ends. ${grace} after the deadline, once the last views are paid, the brand can refund everything that wasn't paid out.`,
  },
  {
    q: "Do I need a crypto wallet?",
    a: "No. You can create a passkey wallet with Face ID, Touch ID or a security key in a few seconds, and ClipPay covers the network fees. If you already use Freighter, you can connect it instead.",
  },
];

export function FaqList() {
  return (
    <div className="divide-y rounded-2xl border bg-card shadow-sm">
      {FAQ.map((f) => (
        <details key={f.q} className="group px-6 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium">
            {f.q}
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="pb-5 text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

function Faq() {
  return (
    <section aria-labelledby="faq-title" className="py-20 sm:py-24">
      <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_2fr]">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 id="faq-title" className="mt-2 text-3xl font-semibold tracking-tight">
            Questions, answered
          </h2>
          <p className="mt-4 text-muted-foreground">
            More on the{" "}
            <a href="/how-it-works" className="font-medium text-primary hover:underline">
              how it works
            </a>{" "}
            and{" "}
            <a href="/security" className="font-medium text-primary hover:underline">
              security
            </a>{" "}
            pages.
          </p>
        </div>
        <FaqList />
      </Container>
    </section>
  );
}

export function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="pb-20 sm:pb-24">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,oklch(0.5_0.21_274),oklch(0.4_0.19_282))] px-6 py-14 text-center text-white sm:px-12">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(40rem_20rem_at_50%_-20%,rgb(255_255_255/0.18),transparent_70%)]"
          />
          <h2 id="cta-title" className="relative text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Ready to pay for views that actually happen?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-white/85">
            Launch a campaign in a few minutes, or pick one and start earning from your next clip.
          </p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 bg-white px-6 text-base text-[oklch(0.42_0.2_276)] hover:bg-white/90",
              )}
            >
              Launch a campaign
            </a>
            <a
              href="/campaigns"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "h-11 border-white/40 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white dark:border-white/40 dark:bg-transparent dark:hover:bg-white/10",
              )}
            >
              Find paid campaigns
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function Home() {
  return (
    <>
      <Hero />
      <StatsBand />
      <Audiences />
      <Steps />
      <LiveCampaigns />
      <Trust />
      <Faq />
      <CtaBand />
      <CampaignCardTemplate />
      <PayoutRowTemplate />
    </>
  );
}
