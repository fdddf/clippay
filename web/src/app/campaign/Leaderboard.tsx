// Creators in a campaign, ranked by what they've earned, each with the
// on-chain payouts behind the number.
import { useState } from "react";
import { ChevronDown, ExternalLink, Trophy } from "lucide-react";
import { AddressChip } from "@/components/AddressChip";
import { Amount } from "@/components/Amount";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";
import type { CampaignDetail, Submission } from "@/lib/api-types";
import { compactNumber, relativeTime } from "@/lib/format";
import { explorer } from "@/lib/network";
import { cn } from "@/lib/utils";
import { displayUrl, holdOf } from "./shared";

function Row({ c, s, rank, you }: { c: CampaignDetail; s: Submission; rank: number; you: boolean }) {
  const [open, setOpen] = useState(false);
  const paid = BigInt(s.paid);
  const gross = paid + BigInt(s.fee);
  const cap = BigInt(c.capPerCreator);
  const pct = cap > 0n ? Math.min(100, Number((gross * 100n) / cap)) : 0;
  const hold = holdOf(s.check);
  const payouts = c.events.filter((e) => e.type === "settled" && e.address === s.creator);
  const panel = `payouts-${s.creator}`;
  return (
    <li className={cn("px-4 py-4 sm:px-5", you && "bg-accent/40")}>
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem_9rem_2rem]">
        <span className="text-center text-sm font-semibold text-muted-foreground tabular">{rank}</span>
        <div className="min-w-0">
          <AddressChip address={s.creator} name={s.profile?.name} avatar={s.profile?.avatar} you={you} actions={false} />
          <div className="mt-1 flex flex-wrap gap-1.5 sm:hidden">
            {gross >= cap && <StatusPill status="capped" />}
            {hold.kind !== "ok" && <StatusPill status={hold.kind === "fix" ? "hold" : "review"} />}
          </div>
        </div>
        <a
          href={s.url}
          target="_blank"
          rel="noreferrer nofollow"
          className="col-span-3 col-start-2 inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:col-span-1 sm:col-start-auto"
        >
          <span className="truncate">{displayUrl(s.url)}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        </a>
        <span className="hidden text-right text-sm tabular sm:block">{compactNumber(BigInt(s.views))} views</span>
        <div className="row-start-1 text-right sm:row-start-auto">
          <Amount units={paid} decimals={c.decimals} tone="money" className="text-sm font-semibold" />
          <div
            role="progressbar"
            aria-label="Share of the per-creator cap earned"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-1.5 ml-auto h-1 w-24 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-money" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular sm:hidden">{compactNumber(BigInt(s.views))} views</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          aria-label={`${open ? "Hide" : "Show"} payouts to ${s.profile?.name ?? "this creator"}`}
          onClick={() => setOpen((o) => !o)}
          className="col-start-3 row-start-2 grid size-8 place-items-center justify-self-end rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:col-start-auto sm:row-start-auto"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 hidden gap-1.5 pl-11 sm:flex">
        {gross >= cap && <StatusPill status="capped" />}
        {hold.kind !== "ok" && <StatusPill status={hold.kind === "fix" ? "hold" : "review"} />}
      </div>
      {open && (
        <div id={panel} className="mt-3 rounded-lg border bg-background p-3 sm:ml-11">
          <p className="text-xs text-muted-foreground">
            Joined {relativeTime(s.submittedAt)} · {payouts.length ? "recent payouts, each a Stellar transaction:" : "no payouts in the recent history yet."}
          </p>
          {payouts.length > 0 && (
            <ul className="mt-2 divide-y text-sm">
              {payouts.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-muted-foreground">
                    {relativeTime(e.ts)} · at {compactNumber(BigInt(e.views ?? "0"))} views
                  </span>
                  <a
                    href={explorer.tx(e.tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-money hover:underline"
                  >
                    <Amount units={BigInt(e.amount ?? "0")} decimals={c.decimals} maxFrac={4} sign className="text-money" />
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function Leaderboard({ c, me }: { c: CampaignDetail; me: string | null }) {
  if (c.submissions.length === 0) {
    return (
      <EmptyState
        icon={<Trophy />}
        title="No creators yet"
        description="Be the first to post a clip — early posts have the most budget to earn from."
      />
    );
  }
  const ranked = [...c.submissions].sort(
    (a, b) => Number(BigInt(b.paid) - BigInt(a.paid)) || Number(BigInt(b.views) - BigInt(a.views)),
  );
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="hidden grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_7rem_9rem_2rem] gap-x-3 border-b bg-muted/50 px-5 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
        <span className="text-center">#</span>
        <span>Creator</span>
        <span>Post</span>
        <span className="text-right">Views</span>
        <span className="text-right">Earned</span>
        <span />
      </div>
      <ol className="divide-y">
        {ranked.map((s, i) => (
          <Row key={s.creator} c={c} s={s} rank={i + 1} you={s.creator === me} />
        ))}
      </ol>
    </div>
  );
}
