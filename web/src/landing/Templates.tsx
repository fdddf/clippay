// Markup the landing client fills with live data: <template>s it clones, and
// the skeletons shown until the first response. Slots are marked `data-f`;
// client.ts sets their text, links and images.
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** A campaign card, as on /campaigns. */
export function CampaignCardTemplate() {
  return (
    <template id="tpl-campaign">
      <a
        data-f="link"
        className="group flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-center gap-2.5">
          <span data-f="avatar" />
          <span data-f="brand" className="min-w-0 truncate text-sm font-medium" />
          <span data-f="status" className="ml-auto" />
        </div>
        <div>
          <h3 data-f="title" className="line-clamp-2 font-semibold leading-snug group-hover:text-primary" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span data-f="platform" className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground" />
            <span data-f="category" className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground" />
          </div>
        </div>
        <div className="mt-auto">
          <p className="flex items-baseline gap-1.5">
            <span data-f="rate" className="tabular text-2xl font-semibold tracking-tight text-money" />
            <span data-f="rate-unit" className="text-sm text-muted-foreground" />
          </p>
          <p data-f="cap" className="text-sm text-muted-foreground" />
        </div>
        <div>
          <div
            data-f="meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div data-f="bar" className="h-full rounded-full bg-primary" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span data-f="left" className="tabular" />
            <span className="inline-flex items-center gap-1 tabular">
              <Users className="size-3" aria-hidden="true" />
              <span data-f="meta" />
            </span>
          </div>
        </div>
      </a>
    </template>
  );
}

/** One payout in the live feed. */
export function PayoutRowTemplate() {
  return (
    <template id="tpl-payout">
      <li className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span data-f="avatar" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" data-f="name" />
          <p className="truncate text-xs text-muted-foreground tabular" data-f="detail" />
        </div>
        <div className="text-right">
          <p data-f="amount" className="tabular text-sm font-semibold text-money" />
          <p data-f="time" className="text-xs text-muted-foreground" />
        </div>
      </li>
    </template>
  );
}

function Bone({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-md bg-muted", className)} />;
}

export function CampaignCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <Bone className="size-8 rounded-[28%]" />
        <Bone className="h-4 w-24" />
        <Bone className="ml-auto h-5 w-14 rounded-full" />
      </div>
      <div className="space-y-2">
        <Bone className="h-5 w-4/5" />
        <Bone className="h-5 w-32" />
      </div>
      <div className="space-y-2">
        <Bone className="h-7 w-28" />
        <Bone className="h-4 w-36" />
      </div>
      <Bone className="h-1.5 w-full rounded-full" />
    </div>
  );
}

export function PayoutRowSkeleton() {
  return (
    <li aria-hidden="true" className="flex items-center gap-3 px-2 py-2">
      <Bone className="size-8 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Bone className="h-3.5 w-24" />
        <Bone className="h-3 w-32" />
      </div>
      <Bone className="h-4 w-16" />
    </li>
  );
}
