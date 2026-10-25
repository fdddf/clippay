// The right-hand card once you've joined: what you've earned, where your post
// is in the check → pay cycle, why it's on hold and how to fix it.
import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Amount } from "@/components/Amount";
import { Timeline, type TimelineItem } from "@/components/Timeline";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { CampaignDetail, Submission } from "@/lib/api-types";
import { compactNumber, formatUnits, relativeTime } from "@/lib/format";
import { config } from "@/lib/network";
import { AppLink } from "../AppLink";
import { errorMessage } from "../errors";
import { keys } from "../queries";
import { displayUrl, holdOf, net, useNow } from "./shared";

export function MySubmission({ c, s }: { c: CampaignDetail; s: Submission }) {
  const queryClient = useQueryClient();
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const sym = config.tokenSymbol;
  const paid = BigInt(s.paid);
  const gross = paid + BigInt(s.fee);
  const cap = BigInt(c.capPerCreator);
  const capped = gross >= cap;
  const pct = cap > 0n ? Math.min(100, Number((gross * 100n) / cap)) : 0;
  const hold = holdOf(s.check);
  const open = c.status === "live" || c.status === "ending" || c.status === "settling";
  const next = s.check ? Math.max(0, Math.ceil(s.check.checkedAt + c.checkEvery - now)) : null;

  const items: TimelineItem[] = [
    { key: "submitted", title: "Submitted", detail: displayUrl(s.url), time: relativeTime(s.submittedAt), state: "done" },
    s.check
      ? {
          key: "checked",
          title: `${compactNumber(BigInt(s.check.views))} views verified`,
          detail: s.check.error ? `Last check failed: ${s.check.error}` : undefined,
          time: relativeTime(s.check.checkedAt),
          state: s.check.error ? "warn" : "done",
        }
      : BigInt(s.views) > 0n
        ? // The verifier restarted since its last check; the contract still has the count it paid for.
          { key: "checked", title: `${compactNumber(BigInt(s.views))} views verified`, state: "done" }
        : { key: "checked", title: "Waiting for the first view check", state: "current" },
  ];
  if (hold.kind === "fix") {
    items.push({
      key: "hold",
      title: "Payouts on hold — fix your post",
      detail: (
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {hold.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li>Then refresh your views below.</li>
        </ul>
      ),
      state: "warn",
    });
  } else if (hold.kind === "review") {
    items.push({
      key: "hold",
      title: "In review",
      detail: (
        <>
          {hold.reasons.join("; ")}. A reviewer will take a look; payouts resume if it's approved.
        </>
      ),
      state: "warn",
    });
  } else if (hold.kind === "rejected") {
    items.push({ key: "hold", title: "Not approved in review", detail: "This post won't be paid further.", state: "warn" });
  } else {
    items.push({
      key: "paid",
      title: paid > 0n ? `Paid ${formatUnits(paid, c.decimals, 2)} ${sym}` : "Payouts start with the first verified views",
      detail: capped ? "You've reached this campaign's cap — nice work." : undefined,
      state: paid > 0n ? "done" : "pending",
    });
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const { results } = await api.checkViews(c.id, s.creator);
      const r = results[0];
      if (r?.error) toast.error("Couldn't check your post", { description: r.error });
      else if (r?.paid && BigInt(r.paid) > 0n)
        // `paid` is what the contract sent you, after the fee.
        toast.success(`+${formatUnits(BigInt(r.paid), c.decimals, 4)} ${sym}`, { description: "Paid for your new views." });
      else toast("Views checked", { description: r?.skipped ? `No payout: ${r.skipped}` : "No new views since the last check." });
      queryClient.setQueryData(keys.campaign(c.id), await api.campaign(c.id, true));
    } catch (e) {
      toast.error(await errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section aria-labelledby="mine-title" className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 id="mine-title" className="font-semibold">
        Your submission
      </h2>
      <div className="mt-4 rounded-xl bg-money-soft/60 p-4">
        <p className="text-sm text-muted-foreground">Earned so far</p>
        <p className="mt-0.5 text-3xl font-semibold tracking-tight">
          <Amount units={paid} decimals={c.decimals} className="text-money" />
        </p>
        <div
          role="progressbar"
          aria-label="Share of the per-creator cap earned"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/70"
        >
          <div className="h-full rounded-full bg-money" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {capped ? (
            "Cap reached"
          ) : (
            <>
              <Amount units={net(c, cap - gross)} decimals={c.decimals} /> more to earn here
            </>
          )}
        </p>
      </div>

      <Timeline items={items} className="mt-5" />

      {open && !capped && hold.kind !== "rejected" && (
        <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {next === null ? "Checked automatically about every minute" : next > 0 ? `Next automatic check in ${next}s` : "Checking now…"}
          </p>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            Refresh my views
          </Button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <a href={s.url} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">
          Open your post <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <AppLink href="/dashboard/wallet" className="text-primary hover:underline">
          Wallet & cash out
        </AppLink>
      </div>
    </section>
  );
}
