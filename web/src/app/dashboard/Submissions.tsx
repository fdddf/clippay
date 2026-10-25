// Every post this account has submitted, where it is in check → pay, and
// what to fix when it's on hold.
import { useState } from "react";
import { ArrowRight, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Amount } from "@/components/Amount";
import { Identicon } from "@/components/Identicon";
import { StatusPill } from "@/components/StatusPill";
import { Button, buttonVariants } from "@/components/ui/button";
import { api, mediaUrl } from "@/lib/api";
import type { Account } from "@/lib/api-types";
import { compactNumber, formatUnits, relativeTime, shortAddress } from "@/lib/format";
import { config } from "@/lib/network";
import { AppLink } from "../AppLink";
import { displayUrl, holdOf } from "../campaign/shared";
import { errorMessage } from "../errors";
import { keys } from "../queries";
import { useTitle } from "../useTitle";
import { PageHeader, useDashboard } from "./Layout";

type Post = Account["submissions"][number];

function PostCard({ s, me }: { s: Post; me: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const hold = holdOf(s.check);
  const open = s.campaignStatus === "live" || s.campaignStatus === "ending" || s.campaignStatus === "settling";
  const brand = s.brandProfile?.name ?? s.brief?.brand.name ?? shortAddress(s.brand);
  const status =
    hold.kind === "fix" ? "hold" : hold.kind === "review" ? "review" : hold.kind === "rejected" ? "hold" : BigInt(s.paid) > 0n ? "paid" : "pending";

  async function refresh() {
    setBusy(true);
    try {
      const { results } = await api.checkViews(s.campaign, me);
      const r = results[0];
      if (r?.error) toast.error("Couldn't check your post", { description: r.error });
      else if (r?.paid && BigInt(r.paid) > 0n) toast.success(`+${formatUnits(BigInt(r.paid), 7, 4)} ${config.tokenSymbol}`, { description: "Paid for your new views." });
      else toast("Views checked", { description: r?.skipped ? `No payout: ${r.skipped}` : "No new views since the last check." });
      void queryClient.invalidateQueries({ queryKey: keys.account(me) });
    } catch (e) {
      toast.error(await errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <Identicon seed={s.brand} name={brand} src={s.brandProfile?.avatar ?? mediaUrl(s.brief?.brand.logo)} square />
        <div className="min-w-0 flex-1">
          <AppLink href={`/c/${s.campaign}`} className="font-medium hover:underline">
            {s.campaignTitle}
          </AppLink>
          <p className="text-sm text-muted-foreground">
            {brand} · joined {relativeTime(s.submittedAt)}
          </p>
        </div>
        <StatusPill status={status} label={hold.kind === "rejected" ? "Not approved" : undefined} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Views</dt>
          <dd className="font-semibold tabular">{compactNumber(BigInt(s.views))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Earned</dt>
          <dd className="font-semibold">
            <Amount units={BigInt(s.paid)} className="text-money" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last check</dt>
          <dd className="tabular">{s.check ? relativeTime(s.check.checkedAt) : "—"}</dd>
        </div>
      </dl>
      {hold.kind === "fix" && (
        <div className="mt-4 rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm">
          <p className="font-medium text-warn">Payouts are on hold until you fix your post</p>
          <ul className="mt-1 list-disc pl-5 text-foreground/80">
            {hold.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-1 text-foreground/80">Edit the post's description, then refresh your views.</p>
        </div>
      )}
      {hold.kind === "review" && (
        <p className="mt-4 rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm text-foreground/80">
          <span className="font-medium text-warn">In review:</span> {hold.reasons.join("; ")}. Payouts resume if it's approved.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        <a href={s.url} target="_blank" rel="noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <span className="truncate">{displayUrl(s.url)}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        </a>
        <span className="ml-auto flex gap-2">
          {open && hold.kind !== "rejected" && (
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              Refresh views
            </Button>
          )}
          <AppLink href={`/c/${s.campaign}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Campaign
            <ArrowRight aria-hidden="true" />
          </AppLink>
        </span>
      </div>
    </li>
  );
}

export default function Submissions() {
  useTitle("Your submissions");
  const { account, wallet } = useDashboard();
  return (
    <>
      <PageHeader title="Submissions" description="Your posts, their verified views and what they've earned." />
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {account.submissions.map((s) => (
          <PostCard key={s.campaign} s={s} me={wallet.address} />
        ))}
      </ul>
    </>
  );
}
