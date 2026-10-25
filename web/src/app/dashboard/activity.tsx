// Turning contract events into sentences for the dashboard.
import { ExternalLink } from "lucide-react";
import { Amount } from "@/components/Amount";
import type { Campaign, ChainEvent } from "@/lib/api-types";
import { relativeTime, shortAddress } from "@/lib/format";
import { explorer } from "@/lib/network";

export function describeEvent(e: ChainEvent, me: string, title: (id: number | null) => string, decimals = 7) {
  const amount = e.amount ? <Amount units={BigInt(e.amount)} decimals={decimals} maxFrac={4} /> : null;
  const c = title(e.campaign);
  const who = e.address === me ? "You" : (e.profile?.name ?? shortAddress(e.address ?? ""));
  switch (e.type) {
    case "settled":
      return e.address === me ? (
        <>
          Earned <span className="text-money">+{amount}</span> from {c}
        </>
      ) : (
        <>
          Paid {amount} to {who} · {c}
        </>
      );
    case "submitted":
      return e.address === me ? <>You joined {c}</> : <>{who} joined {c}</>;
    case "campaign_created":
      return <>You launched {c}</>;
    case "topped_up":
      return (
        <>
          Added {amount} to {c}
        </>
      );
    case "refunded":
      return (
        <>
          Refunded {amount} from {c}
        </>
      );
    default:
      return <>{e.type.replace(/_/g, " ")}</>;
  }
}

export function ActivityList({ events, me, campaigns }: { events: ChainEvent[]; me: string; campaigns: Campaign[] | undefined }) {
  const byId = new Map(campaigns?.map((c) => [c.id, c]));
  const title = (id: number | null) => (id === null ? "a campaign" : (byId.get(id)?.title ?? `campaign #${id}`));
  return (
    <ul className="divide-y">
      {events.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span className="min-w-0">{describeEvent(e, me, title, byId.get(e.campaign ?? -1)?.decimals)}</span>
          <a
            href={explorer.tx(e.tx)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label={`Receipt, ${relativeTime(e.ts)}`}
          >
            {relativeTime(e.ts)}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
