// /c/:id — a campaign from the creator's side (docs/ux-plan.md §5.3): what to
// make, what it pays, who's earning, and how to join. The brand sees its own
// controls in the side card.
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { ArrowLeft, ArrowRight, BadgeCheck, CircleCheck, ExternalLink, Flag, Lock } from "lucide-react";
import { brandLogo, brandName, budgetLeftPct } from "@/components/CampaignCard";
import { ErrorState } from "@/components/EmptyState";
import { Identicon } from "@/components/Identicon";
import { Amount } from "@/components/Amount";
import { StatusPill } from "@/components/StatusPill";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Prose } from "@/landing/Content";
import { ApiError } from "@/lib/api";
import type { CampaignDetail } from "@/lib/api-types";
import { CATEGORY_LABEL, PLATFORM_LABEL } from "@/lib/brief";
import { compactNumber, formatUnits, timeLeft } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { config, explorer } from "@/lib/network";
import { cn } from "@/lib/utils";
import { AppLink } from "../AppLink";
import { BrandCard } from "../campaign/BrandCard";
import { JoinCard } from "../campaign/JoinCard";
import { Leaderboard } from "../campaign/Leaderboard";
import { MySubmission } from "../campaign/MySubmission";
import { ShareMenu } from "../campaign/ShareMenu";
import { net } from "../campaign/shared";
import { useCampaign } from "../queries";
import { useTitle } from "../useTitle";
import { useWallet } from "../wallet";
import { NotFound } from "./NotFound";

function Brief({ c }: { c: CampaignDetail }) {
  if (!c.brief) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <p className="font-medium">The brief for this campaign is hosted by the brand.</p>
        <p className="mt-1 text-sm text-muted-foreground">Read it before you post — your clip has to follow it to be paid.</p>
        <a href={c.briefUrl} target="_blank" rel="noreferrer nofollow" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
          Read the brief
          <ExternalLink aria-hidden="true" />
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <Prose className="[&_h2]:pt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h4]:font-semibold [&_h4]:text-foreground">
        <Markdown source={c.brief.body} className="space-y-4" />
      </Prose>
      {c.brief.exampleUrl && (
        <a href={c.brief.exampleUrl} target="_blank" rel="noreferrer nofollow" className={buttonVariants({ variant: "outline" })}>
          See an example
          <ExternalLink aria-hidden="true" />
        </a>
      )}
      <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {c.briefSource === "hash"
          ? "This brief is pinned to the campaign by its hash, so it can't change after you join."
          : "The brand added this brief after launch. Its fingerprint is stored with the campaign."}
        {c.brief.demo ? " The brand is fictional — this is a demo campaign." : ""}
      </p>
    </div>
  );
}

function Rules({ c }: { c: CampaignDetail }) {
  const sym = config.tokenSymbol;
  const always = [
    "Put your personal clippay: tag and #ad in the post's description",
    "One post per creator",
    `Earnings stop at ${formatUnits(net(c, BigInt(c.capPerCreator)), c.decimals, 2)} ${sym} per creator (after fees)`,
  ];
  return (
    <div className="space-y-6">
      {c.brief && c.brief.rules.length > 0 && (
        <div>
          <h3 className="font-semibold">From {brandName(c)}</h3>
          <ul className="mt-3 space-y-2">
            {c.brief.rules.map((r) => (
              <li key={r} className="flex gap-2.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="font-semibold">Every ClipPay campaign</h3>
        <ul className="mt-3 space-y-2">
          {always.map((r) => (
            <li key={r} className="flex gap-2.5">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
      </div>
      <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
        <Flag className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Posts with sudden view spikes, very low engagement or brand-new channels are held for review before they're
        paid.{" "}
        <a href="/how-it-works#checks" className="font-medium text-primary hover:underline">
          What gets checked
        </a>
      </p>
    </div>
  );
}

function Stats({ c }: { c: CampaignDetail }) {
  const views = BigInt(c.views);
  const spent = BigInt(c.paid) + BigInt(c.fees);
  const per1k = views > 0n ? (spent * 1000n) / views : null;
  const items = [
    {
      label: "Budget left",
      value: <Amount units={BigInt(c.remaining)} decimals={c.decimals} maxFrac={0} />,
      hint: `${budgetLeftPct(c)}% of ${formatUnits(BigInt(c.budget), c.decimals, 0)}`,
    },
    { label: "Paid to creators", value: <Amount units={BigInt(c.paid)} decimals={c.decimals} />, hint: `${c.creators} creators` },
    { label: "Verified views", value: compactNumber(views), hint: "across all posts" },
    {
      label: "Cost per 1k views",
      value: per1k === null ? "—" : <Amount units={per1k} decimals={c.decimals} />,
      hint: per1k === null ? "no views yet" : "budget spent ÷ views",
    },
  ];
  return (
    <section aria-labelledby="stats-title">
      <h2 id="stats-title" className="sr-only">
        Campaign numbers
      </h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">{it.label}</dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight tabular">{it.value}</dd>
            <dd className="text-xs text-muted-foreground">{it.hint}</dd>
          </div>
        ))}
      </dl>
      <a
        href={explorer.account(config.contractId)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <BadgeCheck className="size-3.5" aria-hidden="true" />
        Every payout is a transaction on Stellar — check the contract
        <ExternalLink className="size-3" aria-hidden="true" />
      </a>
    </section>
  );
}

function ClosedCard({ c }: { c: CampaignDetail }) {
  return (
    <section aria-labelledby="closed-title" className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 id="closed-title" className="font-semibold">
        Submissions are closed
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {c.status === "settling"
          ? "This campaign has ended. Views on existing posts are still being paid for a few more minutes."
          : c.status === "spent"
            ? "This campaign's budget has been fully paid out."
            : "This campaign has ended."}
      </p>
      <AppLink href="/campaigns" className={cn(buttonVariants(), "mt-4 w-full")}>
        Find open campaigns
        <ArrowRight aria-hidden="true" />
      </AppLink>
    </section>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading campaign">
      <div className="border-b bg-muted/40">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6">
          <Skeleton className="h-4 w-28" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-14 rounded-2xl" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** Whether the element with `id` is on screen (false until it exists). */
function useOnScreen(id: string, enabled: boolean): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = enabled ? document.getElementById(id) : null;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e!.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [id, enabled]);
  return visible;
}

export default function CampaignPage() {
  const { id: raw } = useParams();
  const id = Number(raw);
  const valid = Number.isInteger(id) && id >= 0;
  const q = useCampaign(valid ? id : -1);
  const { wallet } = useWallet();
  useTitle(q.data?.title);
  const joinVisible = useOnScreen("join", !!q.data);

  if (!valid || (q.error instanceof ApiError && q.error.status === 404)) {
    return <NotFound what="campaign" />;
  }
  if (q.error && !q.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <ErrorState message="Couldn't load this campaign." onRetry={() => void q.refetch()} />
      </div>
    );
  }
  if (!q.data) return <PageSkeleton />;

  const c = q.data;
  const me = wallet?.address ?? null;
  const mine = me ? c.submissions.find((s) => s.creator === me) : undefined;
  const isBrand = me === c.brand;
  const open = c.status === "live" || c.status === "ending";
  const side = isBrand ? "brand" : mine ? "mine" : open ? "join" : "closed";
  const ends = timeLeft(c.deadline);
  const sym = config.tokenSymbol;

  return (
    <div className={cn(side === "join" && "pb-24 lg:pb-0")}>
      <section className="border-b bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6">
          <AppLink href="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All campaigns
          </AppLink>
          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Identicon seed={c.brand} name={brandName(c)} src={brandLogo(c)} square size="lg" />
                <span className="font-medium">{brandName(c)}</span>
                <StatusPill status={c.status} />
                {open && ends && <span className="text-sm text-muted-foreground">{ends} left</span>}
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{c.title}</h1>
              {c.brief?.summary && <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{c.brief.summary}</p>}
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {c.brief && (
                  <>
                    <span className="rounded-md bg-background px-2 py-1 shadow-xs ring-1 ring-border">
                      {PLATFORM_LABEL[c.brief.platform]}
                    </span>
                    <span className="rounded-md bg-background px-2 py-1 shadow-xs ring-1 ring-border">
                      {CATEGORY_LABEL[c.brief.category]}
                    </span>
                  </>
                )}
                <span className="rounded-md bg-background px-2 py-1 shadow-xs ring-1 ring-border">
                  <span className="font-semibold text-money">{formatUnits(BigInt(c.ratePer1k), c.decimals, 2)} {sym}</span> per 1k views
                </span>
              </div>
            </div>
            {!isBrand && (
              <div className="shrink-0">
                <ShareMenu c={c} />
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-10">
        <div className="min-w-0 space-y-10">
          <Tabs defaultValue="brief">
            <TabsList>
              <TabsTrigger value="brief">Brief</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="creators">
                Creators <span className="ml-1 text-muted-foreground tabular">{c.submissions.length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="brief" className="pt-4">
              <Brief c={c} />
            </TabsContent>
            <TabsContent value="rules" className="pt-4">
              <Rules c={c} />
            </TabsContent>
            <TabsContent value="creators" className="pt-4">
              <Leaderboard c={c} me={me} />
            </TabsContent>
          </Tabs>
          <Stats c={c} />
        </div>
        <aside className={cn("lg:sticky lg:top-24 lg:self-start", side === "join" ? "order-last lg:order-none" : "order-first lg:order-none")}>
          {side === "brand" && <BrandCard c={c} />}
          {side === "mine" && <MySubmission c={c} s={mine!} />}
          {side === "join" && <JoinCard c={c} />}
          {side === "closed" && <ClosedCard c={c} />}
        </aside>
      </div>

      {side === "join" && (
        <div
          inert={joinVisible}
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur transition-transform lg:hidden",
            joinVisible && "pointer-events-none translate-y-full",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <p className="text-muted-foreground">Earn up to</p>
              <Amount units={net(c, BigInt(c.capPerCreator))} decimals={c.decimals} className="font-semibold text-money" />
            </div>
            <Button
              size="lg"
              onClick={() => {
                document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "start" });
                setTimeout(() => document.getElementById("post-url")?.focus({ preventScroll: true }), 400);
              }}
            >
              Join campaign
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
