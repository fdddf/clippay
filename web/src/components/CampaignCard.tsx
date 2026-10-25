// A campaign in a grid (/campaigns). The landing page has a static twin of
// this card (landing/Templates.tsx) filled without React.
import { Users } from "lucide-react";
import { AppLink } from "@/app/AppLink";
import { Identicon } from "@/components/Identicon";
import { StatusPill } from "@/components/StatusPill";
import type { Campaign } from "@/lib/api-types";
import { mediaUrl } from "@/lib/api";
import { CATEGORY_LABEL, PLATFORM_LABEL } from "@/lib/brief";
import { formatUnits, shortAddress, timeLeft } from "@/lib/format";
import { config } from "@/lib/network";
import { cn } from "@/lib/utils";

export function brandName(c: Campaign): string {
  return c.brandProfile?.name ?? c.brief?.brand.name ?? shortAddress(c.brand);
}

export function brandLogo(c: Campaign): string | null {
  return c.brandProfile?.avatar ?? mediaUrl(c.brief?.brand.logo);
}

/** Share of the budget still unspent, 0–100. */
export function budgetLeftPct(c: Campaign): number {
  const budget = BigInt(c.budget);
  return budget > 0n ? Number((BigInt(c.remaining) * 100n) / budget) : 0;
}

export function CampaignCard({ c, className }: { c: Campaign; className?: string }) {
  const sym = config.tokenSymbol;
  const left = budgetLeftPct(c);
  const open = c.status === "live" || c.status === "ending";
  const ends = timeLeft(c.deadline);
  const almostFull = open && left < 10;
  return (
    <AppLink
      href={`/c/${c.id}`}
      className={cn(
        "group flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <Identicon seed={c.brand} name={brandName(c)} src={brandLogo(c)} square />
        <span className="min-w-0 truncate text-sm font-medium">{brandName(c)}</span>
        <span className="ml-auto flex shrink-0 gap-1.5">
          {almostFull && <StatusPill status="ending" label="Almost full" />}
          <StatusPill status={c.status} />
        </span>
      </div>
      <div>
        <h3 className="line-clamp-2 leading-snug font-semibold group-hover:text-primary">{c.title}</h3>
        {c.brief && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {PLATFORM_LABEL[c.brief.platform]}
            </span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {CATEGORY_LABEL[c.brief.category]}
            </span>
          </div>
        )}
      </div>
      <div className="mt-auto">
        <p className="flex items-baseline gap-1.5">
          <span className="tabular text-2xl font-semibold tracking-tight text-money">
            {formatUnits(BigInt(c.ratePer1k), c.decimals, 2)}
          </span>
          <span className="text-sm text-muted-foreground">{sym} per 1k views</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Earn up to {formatUnits(BigInt(c.capPerCreator), c.decimals, 2, 0)} {sym}
        </p>
      </div>
      <div>
        <div
          role="progressbar"
          aria-label="Budget left"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={left}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full", almostFull ? "bg-warn" : "bg-primary")} style={{ width: `${left}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular">
            {formatUnits(BigInt(c.remaining), c.decimals, 0)} of {formatUnits(BigInt(c.budget), c.decimals, 0)} {sym} left
          </span>
          <span className="inline-flex items-center gap-1 tabular">
            <Users className="size-3" aria-hidden="true" />
            {c.creators} · {open && ends ? `${ends} left` : c.status === "settling" ? "final payouts" : "ended"}
          </span>
        </div>
      </div>
    </AppLink>
  );
}

export function CampaignCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="size-8 animate-pulse rounded-[28%] bg-muted" />
        <span className="h-4 w-24 animate-pulse rounded bg-muted" />
        <span className="ml-auto h-5 w-14 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="space-y-2">
        <span className="block h-5 w-4/5 animate-pulse rounded bg-muted" />
        <span className="block h-5 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2">
        <span className="block h-7 w-28 animate-pulse rounded bg-muted" />
        <span className="block h-4 w-36 animate-pulse rounded bg-muted" />
      </div>
      <span className="block h-1.5 w-full animate-pulse rounded-full bg-muted" />
    </div>
  );
}
