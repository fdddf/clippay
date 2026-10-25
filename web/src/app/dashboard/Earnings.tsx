// What this account has earned: totals, by campaign, over time, and every
// payout with its transaction.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Amount } from "@/components/Amount";
import { BarChart } from "@/components/BarChart";
import { DataList } from "@/components/DataList";
import { EmptyState } from "@/components/EmptyState";
import { Stat } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { compactNumber, formatUnits, plural } from "@/lib/format";
import { config, explorer } from "@/lib/network";
import { AppLink } from "../AppLink";
import { useTitle } from "../useTitle";
import { PageHeader, useDashboard } from "./Layout";

const PAGE = 25;

export default function Earnings() {
  useTitle("Earnings");
  const { account: a, wallet } = useDashboard();
  const [shown, setShown] = useState(PAGE);
  const payouts = useQuery({
    queryKey: ["payouts", wallet.address],
    queryFn: () => api.events({ address: wallet.address, type: "settled", limit: 200 }),
  });
  const titles = new Map(a.submissions.map((s) => [s.campaign, s.campaignTitle]));
  const total = BigInt(a.totals.earned);
  const byCampaign = [...a.submissions].sort((x, y) => Number(BigInt(y.paid) - BigInt(x.paid)));
  const dec = config.tokenDecimals;

  // Buckets by hour while the history is short, by day after that.
  const list = payouts.data ?? [];
  const span = list.length ? list[0]!.ts - list.at(-1)!.ts : 0;
  const hourly = span < 3 * 86_400;
  const buckets = new Map<string, bigint>();
  for (const e of [...list].reverse()) {
    const d = new Date(e.ts * 1000);
    const k = hourly ? format(d, "yyyy-MM-dd HH:00") : format(d, "yyyy-MM-dd");
    buckets.set(k, (buckets.get(k) ?? 0n) + BigInt(e.amount ?? "0"));
  }

  return (
    <>
      <PageHeader title="Earnings" description="Every payout goes straight to your wallet, with a receipt on Stellar." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Earned in total" value={<Amount units={total} className="text-money" />} hint={`from ${plural(a.submissions.length, "post")}`} />
        <Stat label="This month" value={<Amount units={BigInt(a.totals.earnedThisMonth)} />} hint={format(new Date(), "MMMM")} />
        <Stat label="Views paid for" value={compactNumber(BigInt(a.totals.views))} hint="across all posts" />
      </div>

      <section aria-labelledby="by-campaign" className="mt-8 rounded-xl border bg-card p-5 shadow-sm">
        <h2 id="by-campaign" className="font-semibold">
          By campaign
        </h2>
        <ul className="mt-4 space-y-3">
          {byCampaign.map((s) => {
            const pct = total > 0n ? Number((BigInt(s.paid) * 100n) / total) : 0;
            return (
              <li key={s.campaign}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <AppLink href={`/c/${s.campaign}`} className="min-w-0 truncate hover:underline">
                    {s.campaignTitle}
                  </AppLink>
                  <Amount units={BigInt(s.paid)} className="shrink-0 font-medium" />
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-money" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {buckets.size > 1 && (
        <BarChart
          className="mt-8"
          title={`Earnings per ${hourly ? "hour" : "day"}`}
          color="var(--money)"
          format={(v) => (v >= 10 ? Math.round(v).toString() : v.toFixed(2))}
          bars={[...buckets].map(([k, v]) => ({
            key: k,
            label: hourly ? k.slice(11, 16) : format(new Date(`${k}T00:00`), "MMM d"),
            value: Number(v) / 10 ** dec,
            display: `${formatUnits(v, dec, 4)} ${config.tokenSymbol}`,
          }))}
        />
      )}

      <section aria-labelledby="payouts-title" className="mt-8">
        <h2 id="payouts-title" className="mb-3 font-semibold">
          Payouts
        </h2>
        {payouts.isPending ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : list.length === 0 ? (
          <EmptyState title="No payouts yet" description="Payouts appear here as soon as your first views are verified." />
        ) : (
          <>
            <div className="rounded-xl border bg-card shadow-sm">
              <DataList
                caption="Payouts"
                rows={list.slice(0, shown)}
                rowKey={(e) => e.id}
                columns={[
                  { key: "when", header: "When", mobile: "primary", cell: (e) => format(new Date(e.ts * 1000), "MMM d, HH:mm") },
                  { key: "campaign", header: "Campaign", cell: (e) => <span className="block max-w-56 truncate">{titles.get(e.campaign ?? -1) ?? `#${e.campaign}`}</span> },
                  { key: "views", header: "At views", align: "right", cell: (e) => compactNumber(BigInt(e.views ?? "0")) },
                  {
                    key: "amount",
                    header: "Amount",
                    align: "right",
                    cell: (e) => (
                      <a href={explorer.tx(e.tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-money hover:underline">
                        <Amount units={BigInt(e.amount ?? "0")} maxFrac={4} sign className="text-money" />
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ),
                  },
                ]}
              />
            </div>
            {shown < list.length && (
              <Button variant="outline" className="mt-4" onClick={() => setShown((n) => n + PAGE)}>
                Show more
              </Button>
            )}
            {list.length === 200 && <p className="mt-2 text-xs text-muted-foreground">Showing your latest 200 payouts.</p>}
          </>
        )}
      </section>
    </>
  );
}
