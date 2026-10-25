import { AlertTriangle, ArrowRight, CircleCheck, Clock, Megaphone, Search, Undo2 } from "lucide-react";
import { Amount } from "@/components/Amount";
import { CampaignCard } from "@/components/CampaignCard";
import { Stat } from "@/components/Stat";
import { buttonVariants } from "@/components/ui/button";
import { compactNumber, timeLeft } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AppLink } from "../AppLink";
import { holdOf } from "../campaign/shared";
import { useCampaigns } from "../queries";
import { useTitle } from "../useTitle";
import { ActivityList } from "./activity";
import { PageHeader, useDashboard } from "./Layout";

interface Todo {
  key: string;
  icon: React.ReactNode;
  text: React.ReactNode;
  href: string;
  action: string;
}

export default function Overview() {
  useTitle("Dashboard");
  const { wallet, account: a, balance } = useDashboard();
  const campaigns = useCampaigns();
  const now = Date.now() / 1000;
  const name = a.profile?.name;
  const isBrand = a.campaigns.length > 0;
  const isCreator = a.submissions.length > 0;

  const todos: Todo[] = [];
  for (const s of a.submissions) {
    const h = holdOf(s.check);
    if (h.kind === "fix")
      todos.push({
        key: `fix-${s.campaign}`,
        icon: <AlertTriangle className="text-warn" />,
        text: (
          <>
            Your post for <strong>{s.campaignTitle}</strong> is on hold: {h.reasons[0]}
          </>
        ),
        href: `/c/${s.campaign}`,
        action: "Fix it",
      });
    if (h.kind === "review")
      todos.push({
        key: `review-${s.campaign}`,
        icon: <Clock className="text-warn" />,
        text: (
          <>
            Your post for <strong>{s.campaignTitle}</strong> is in review
          </>
        ),
        href: `/c/${s.campaign}`,
        action: "View",
      });
  }
  for (const c of a.campaigns) {
    if (!c.refunded && BigInt(c.remaining) > 0n && now > c.refundAt)
      todos.push({
        key: `refund-${c.id}`,
        icon: <Undo2 className="text-info" />,
        text: (
          <>
            <Amount units={BigInt(c.remaining)} decimals={c.decimals} /> left in <strong>{c.title}</strong> can be refunded
          </>
        ),
        href: `/dashboard/campaigns/${c.id}`,
        action: "Refund",
      });
    else if (c.status === "ending")
      todos.push({
        key: `ending-${c.id}`,
        icon: <Clock className="text-muted-foreground" />,
        text: (
          <>
            <strong>{c.title}</strong> ends in {timeLeft(c.deadline)}
          </>
        ),
        href: `/dashboard/campaigns/${c.id}`,
        action: "Manage",
      });
  }

  const joined = new Set(a.submissions.map((s) => s.campaign));
  const suggestions = (campaigns.data ?? [])
    .filter((c) => (c.status === "live" || c.status === "ending") && !joined.has(c.id) && c.brand !== wallet.address)
    .slice(0, 2);

  if (!isBrand && !isCreator) {
    return (
      <>
        <PageHeader title={name ? `Welcome, ${name}` : "Welcome to ClipPay"} description="What would you like to do first?" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[
            { icon: <Search />, title: "Earn from your clips", text: "Pick a campaign, post a clip, and get paid as your views are verified.", href: "/campaigns", cta: "Find paid campaigns" },
            { icon: <Megaphone />, title: "Launch your first campaign", text: "Lock a budget and pay creators only for views that happen.", href: "/new", cta: "Launch a campaign" },
          ].map((x) => (
            <div key={x.href} className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
              <div className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">{x.icon}</div>
              <h2 className="mt-4 text-lg font-semibold">{x.title}</h2>
              <p className="mt-1 text-muted-foreground">{x.text}</p>
              <AppLink href={x.href} className={cn(buttonVariants(), "mt-6 self-start")}>
                {x.cta}
                <ArrowRight aria-hidden="true" />
              </AppLink>
            </div>
          ))}
        </div>
        <Stat className="mt-6 max-w-xs" label="Wallet balance" value={balance !== undefined ? <Amount units={balance} /> : "—"} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={name ? `Hi, ${name}` : "Overview"} description="Everything happening across your campaigns and posts." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Wallet balance" value={balance !== undefined ? <Amount units={balance} /> : "—"} hint="available now" />
        {isCreator && (
          <Stat
            label="Earned this month"
            value={<Amount units={BigInt(a.totals.earnedThisMonth)} className="text-money" />}
            hint={
              <>
                <Amount units={BigInt(a.totals.earned)} /> in total
              </>
            }
          />
        )}
        {isCreator && <Stat label="Views verified" value={compactNumber(BigInt(a.totals.views))} hint={`${a.submissions.length} posts`} />}
        {isBrand && (
          <Stat
            label="Spent on campaigns"
            value={<Amount units={BigInt(a.totals.spent)} />}
            hint={
              <>
                <Amount units={BigInt(a.totals.lockedInCampaigns)} /> still locked
              </>
            }
          />
        )}
        <Stat label="Needs attention" value={todos.length} hint={todos.length ? "see below" : "all clear"} />
      </div>

      <section aria-labelledby="todo-title" className="mt-8 rounded-xl border bg-card shadow-sm">
        <h2 id="todo-title" className="border-b px-5 py-3 font-semibold">
          To do
        </h2>
        {todos.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-ok" aria-hidden="true" />
            Nothing needs your attention right now.
          </p>
        ) : (
          <ul className="divide-y">
            {todos.map((t) => (
              <li key={t.key} className="flex items-center gap-3 px-5 py-3 text-sm [&>svg]:size-4 [&>svg]:shrink-0">
                {t.icon}
                <span className="min-w-0 flex-1">{t.text}</span>
                <AppLink href={t.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {t.action}
                </AppLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="activity-title" className="rounded-xl border bg-card shadow-sm">
          <h2 id="activity-title" className="border-b px-5 py-3 font-semibold">
            Recent activity
          </h2>
          <div className="px-5">
            {a.events.length ? (
              <ActivityList events={a.events.slice(0, 10)} me={wallet.address} campaigns={campaigns.data} />
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No activity yet.</p>
            )}
          </div>
        </section>
        {suggestions.length > 0 && (
          <section aria-labelledby="suggest-title">
            <h2 id="suggest-title" className="mb-3 font-semibold">
              Campaigns you could join
            </h2>
            <div className="space-y-4">
              {suggestions.map((c) => (
                <CampaignCard key={c.id} c={c} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
