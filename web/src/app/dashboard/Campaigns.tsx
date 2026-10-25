import { useNavigate } from "react-router";
import { Megaphone } from "lucide-react";
import { Amount } from "@/components/Amount";
import { budgetLeftPct } from "@/components/CampaignCard";
import { DataList } from "@/components/DataList";
import { StatusPill } from "@/components/StatusPill";
import { buttonVariants } from "@/components/ui/button";
import type { Campaign } from "@/lib/api-types";
import { compactNumber, timeLeft } from "@/lib/format";
import { AppLink } from "../AppLink";
import { useTitle } from "../useTitle";
import { PageHeader, useDashboard } from "./Layout";

/** What a campaign has spent per 1,000 verified views, or null before any views. */
export function costPer1k(c: Campaign): bigint | null {
  const views = BigInt(c.views);
  return views > 0n ? ((BigInt(c.paid) + BigInt(c.fees)) * 1000n) / views : null;
}

export default function DashboardCampaigns() {
  useTitle("Your campaigns");
  const { account } = useDashboard();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Budgets, spend and results for the campaigns you've launched."
        actions={
          <AppLink href="/new" className={buttonVariants()}>
            <Megaphone aria-hidden="true" />
            Launch a campaign
          </AppLink>
        }
      />
      <div className="rounded-xl border bg-card shadow-sm">
        <DataList
          caption="Your campaigns"
          rows={account.campaigns}
          rowKey={(c) => String(c.id)}
          onRowClick={(c) => navigate(`/dashboard/campaigns/${c.id}`)}
          columns={[
            {
              key: "title",
              header: "Campaign",
              mobile: "primary",
              cell: (c) => (
                <div className="min-w-0">
                  <AppLink href={`/dashboard/campaigns/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {c.title}
                  </AppLink>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusPill status={c.status} />
                    {(c.status === "live" || c.status === "ending") && timeLeft(c.deadline) && <span>{timeLeft(c.deadline)} left</span>}
                  </div>
                </div>
              ),
            },
            {
              key: "left",
              header: "Budget left",
              cell: (c) => (
                <div className="min-w-28">
                  <Amount units={BigInt(c.remaining)} decimals={c.decimals} maxFrac={0} />
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${budgetLeftPct(c)}%` }} />
                  </div>
                </div>
              ),
            },
            { key: "spent", header: "Spent", align: "right", cell: (c) => <Amount units={BigInt(c.paid) + BigInt(c.fees)} decimals={c.decimals} /> },
            { key: "views", header: "Views", align: "right", cell: (c) => compactNumber(BigInt(c.views)) },
            {
              key: "cpm",
              header: "Per 1k views",
              align: "right",
              cell: (c) => {
                const v = costPer1k(c);
                return v === null ? "—" : <Amount units={v} decimals={c.decimals} />;
              },
            },
            { key: "creators", header: "Creators", align: "right", cell: (c) => c.creators },
          ]}
        />
      </div>
    </>
  );
}
