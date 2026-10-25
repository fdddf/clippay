// /dashboard/campaigns/:id — a campaign from the brand's side
// (docs/ux-plan.md §5.4): results, spend over time, every creator's status,
// and the controls — add budget, check views, refund, export.
import { useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Download, ExternalLink, Loader2, Plus, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { AddressChip } from "@/components/AddressChip";
import { Amount } from "@/components/Amount";
import { BarChart } from "@/components/BarChart";
import { budgetLeftPct } from "@/components/CampaignCard";
import { DataList } from "@/components/DataList";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Stat } from "@/components/Stat";
import { StatusPill, type Status } from "@/components/StatusPill";
import { TxProgress, useTxProgress } from "@/components/TxProgress";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { CampaignDetail, Submission } from "@/lib/api-types";
import { compactNumber, formatUnits, parseUnits, timeLeft } from "@/lib/format";
import { config } from "@/lib/network";
import { AppLink } from "../AppLink";
import { ShareMenu } from "../campaign/ShareMenu";
import { displayUrl, holdOf, useNow } from "../campaign/shared";
import { errorMessage } from "../errors";
import { keys, useBalance, useCampaign } from "../queries";
import { useTitle } from "../useTitle";
import { loadWallet } from "../wallet";
import { costPer1k } from "./Campaigns";
import { PageHeader, useDashboard } from "./Layout";

function postStatus(c: CampaignDetail, s: Submission): { status: Status; reason?: string } {
  const h = holdOf(s.check);
  if (h.kind === "fix") return { status: "hold", reason: h.reasons.join("; ") };
  if (h.kind === "review") return { status: "review", reason: h.reasons.join("; ") };
  if (h.kind === "rejected") return { status: "hold", reason: "Rejected in review" };
  if (BigInt(s.paid) + BigInt(s.fee) >= BigInt(c.capPerCreator)) return { status: "capped" };
  return BigInt(s.paid) > 0n ? { status: "paid" } : { status: "pending" };
}

function exportCsv(c: CampaignDetail) {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const units = (u: string) => formatUnits(BigInt(u), c.decimals, c.decimals, 0).replace(/,/g, "");
  const rows = [
    ["creator", "name", "post", "submitted_utc", "views", `paid_${config.tokenSymbol}`, `fee_${config.tokenSymbol}`, "status", "reason"],
    ...c.submissions.map((s) => {
      const st = postStatus(c, s);
      return [s.creator, s.profile?.name ?? "", s.url, new Date(s.submittedAt * 1000).toISOString(), s.views, units(s.paid), units(s.fee), st.status, st.reason ?? ""];
    }),
  ];
  const blob = new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `clippay-campaign-${c.id}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Charts({ c }: { c: CampaignDetail }) {
  // Hourly while the campaign is young, daily after that.
  const now = Date.now() / 1000;
  const start = Math.min(now, ...c.submissions.map((s) => s.submittedAt), ...c.events.map((e) => e.ts));
  const by = now - start < 3 * 86_400 ? "hour" : "day";
  const q = useQuery({ queryKey: ["daily", c.id, by], queryFn: () => api.daily(c.id, by), refetchInterval: 60_000 });
  if (q.isPending) return <Skeleton className="h-60 rounded-xl" />;
  if (!q.data?.length) return null;
  const scale = 10 ** c.decimals;
  const label = (d: string) => (by === "hour" ? format(new Date(d), "HH:mm") : format(new Date(`${d}T00:00Z`), "MMM d"));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <BarChart
        title={`Spend per ${by}`}
        format={(v) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1))}
        bars={q.data.map((d) => {
          const spent = BigInt(d.paid) + BigInt(d.fees);
          return { key: d.day, label: label(d.day), value: Number(spent) / scale, display: `${formatUnits(spent, c.decimals, 2)} ${config.tokenSymbol}` };
        })}
      />
      <BarChart
        title={`New verified views per ${by}`}
        color="var(--chart-2)"
        format={(v) => compactNumber(Math.round(v))}
        bars={q.data.map((d) => ({ key: d.day, label: label(d.day), value: d.views, display: `${d.views.toLocaleString("en-US")} views` }))}
      />
    </div>
  );
}

function Actions({ c }: { c: CampaignDetail }) {
  const { wallet } = useDashboard();
  const balance = useBalance(wallet.address);
  const queryClient = useQueryClient();
  const tx = useTxProgress();
  const now = useNow(30_000);
  const [amount, setAmount] = useState("");
  const [checking, setChecking] = useState(false);
  const sym = config.tokenSymbol;
  const remaining = BigInt(c.remaining);
  const open = !c.refunded && now <= c.refundAt;
  const canRefund = !c.refunded && remaining > 0n && now > c.refundAt;
  const busy = !!tx.state && !tx.state.done && !tx.state.error;
  const topUp = parseUnits(amount, c.decimals);
  const tooMuch = topUp !== null && balance.data !== undefined && topUp > balance.data;

  const refresh = async () => {
    queryClient.setQueryData(keys.campaign(c.id), await api.campaign(c.id, true).catch(() => undefined));
    void queryClient.invalidateQueries({ queryKey: keys.account(wallet.address) });
    void queryClient.invalidateQueries({ queryKey: ["balance"] });
  };

  async function send(label: string, build: Parameters<Awaited<ReturnType<typeof loadWallet>>["sendAs"]>[1]) {
    const ok = await tx.run(async (step) => {
      const m = await loadWallet();
      step("sign");
      try {
        const { hash } = await m.sendAs(wallet, build);
        return { hash, value: true };
      } catch (e) {
        throw new Error(await errorMessage(e));
      }
    });
    if (ok) {
      toast.success(label);
      await refresh();
    }
  }

  const onTopUp = (e: FormEvent) => {
    e.preventDefault();
    if (!topUp || tooMuch) return;
    void send(`Added ${formatUnits(topUp, c.decimals, 2)} ${sym}`, (client) => client.top_up({ id: c.id, from: wallet.address, amount: topUp })).then(() =>
      setAmount(""),
    );
  };

  async function checkNow() {
    setChecking(true);
    try {
      const { results } = await api.checkViews(c.id);
      const paid = results.reduce((n, r) => n + BigInt(r.paid ?? "0"), 0n);
      toast.success(`Paid ${formatUnits(paid, c.decimals, 2)} ${sym} to creators`);
      await refresh();
    } catch (e) {
      toast.error(await errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <section aria-labelledby="actions-title" className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 id="actions-title" className="font-semibold">
        Manage
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {open && (
          <form onSubmit={onTopUp} className="space-y-2">
            <Label htmlFor="topup">Add budget</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="topup"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  aria-invalid={tooMuch || undefined}
                  aria-describedby="topup-hint"
                  className="pr-12 tabular"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{sym}</span>
              </div>
              <Button type="submit" disabled={!topUp || tooMuch || busy}>
                <Plus aria-hidden="true" />
                Add
              </Button>
            </div>
            <p id="topup-hint" className={tooMuch ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {tooMuch ? "More than your wallet holds" : balance.data !== undefined ? <>Wallet: <Amount units={balance.data} /></> : "Goes straight into this campaign's budget."}
            </p>
          </form>
        )}
        <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {(c.status === "live" || c.status === "ending" || c.status === "settling") && (
            <Button variant="outline" onClick={checkNow} disabled={checking}>
              {checking ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              Check views now
            </Button>
          )}
          {!c.refunded && remaining > 0n && (
            <Button
              variant="outline"
              disabled={!canRefund || busy}
              onClick={() => void send(`Refunded ${formatUnits(remaining, c.decimals, 2)} ${sym}`, (client) => client.refund({ id: c.id }))}
            >
              <Undo2 aria-hidden="true" />
              Refund {formatUnits(remaining, c.decimals, 2)} {sym}
            </Button>
          )}
          <Button variant="outline" onClick={() => exportCsv(c)} disabled={c.submissions.length === 0}>
            <Download aria-hidden="true" />
            Export creators (CSV)
          </Button>
        </div>
      </div>
      {!canRefund && !c.refunded && remaining > 0n && (
        <p className="mt-2 text-xs text-muted-foreground">
          Refund opens {format(new Date(c.refundAt * 1000), "MMM d 'at' h:mm a")} ({timeLeft(c.refundAt, now)} from now).
        </p>
      )}
      {c.refunded && <p className="mt-3 text-sm text-muted-foreground">The unspent budget was refunded.</p>}
      {tx.state && (
        <TxProgress state={tx.state} signLabel={wallet.kind === "passkey" ? "Confirm with your passkey" : "Confirm in Freighter"} className="mt-4 rounded-lg border p-4" />
      )}
    </section>
  );
}

export default function CampaignManage() {
  const { id: raw } = useParams();
  const id = Number(raw);
  const { wallet } = useDashboard();
  const q = useCampaign(id);
  useTitle(q.data ? `Manage: ${q.data.title}` : "Manage campaign");
  const daily = useQuery({ queryKey: ["daily", id, "hour"], queryFn: () => api.daily(id, "hour"), enabled: !!q.data, refetchInterval: 60_000 });

  if (q.error && !q.data) return <ErrorState message="Couldn't load this campaign." onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96 rounded-xl" />;
  const c = q.data;
  if (c.brand !== wallet.address) {
    return (
      <EmptyState
        heading="h1"
        title="This isn't one of your campaigns"
        description="Only the brand that launched a campaign can manage it."
        action={
          <AppLink href={`/c/${c.id}`} className={buttonVariants({ variant: "outline" })}>
            View the campaign page
          </AppLink>
        }
      />
    );
  }

  const spent = BigInt(c.paid) + BigInt(c.fees);
  const cpm = costPer1k(c);
  // Pace over the last 24 hours, to estimate when the budget runs out.
  const dayAgo = Date.now() / 1000 - 86_400;
  const recent = (daily.data ?? []).filter((d) => new Date(d.day).getTime() / 1000 >= dayAgo);
  const perSec = Number(recent.reduce((n, d) => n + BigInt(d.paid) + BigInt(d.fees), 0n)) / 86_400;
  const runsOutAt = perSec > 0 ? Date.now() / 1000 + Number(c.remaining) / perSec : null;
  const runsOut = runsOutAt && runsOutAt < c.deadline ? timeLeft(runsOutAt) : null;
  const open = c.status === "live" || c.status === "ending";

  return (
    <>
      <AppLink href="/dashboard/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Campaigns
      </AppLink>
      <PageHeader
        title={c.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={c.status} />
            {open && timeLeft(c.deadline) ? `${timeLeft(c.deadline)} left` : `Ended ${format(new Date(c.deadline * 1000), "MMM d")}`}
          </span>
        }
        actions={
          <>
            <AppLink href={`/c/${c.id}`} className={buttonVariants({ variant: "outline" })}>
              Public page
              <ExternalLink aria-hidden="true" />
            </AppLink>
            <ShareMenu c={c} />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Spent" value={<Amount units={spent} decimals={c.decimals} />} hint={<>of <Amount units={BigInt(c.budget)} decimals={c.decimals} maxFrac={0} /></>} />
        <Stat label="Verified views" value={compactNumber(BigInt(c.views))} hint={`${c.creators} creators`} />
        <Stat
          label="Cost per 1k views"
          value={cpm === null ? "—" : <Amount units={cpm} decimals={c.decimals} />}
          hint={<>rate <Amount units={BigInt(c.ratePer1k)} decimals={c.decimals} /></>}
        />
        <Stat
          label="Budget left"
          value={<Amount units={BigInt(c.remaining)} decimals={c.decimals} />}
          hint={runsOut && open ? `at this pace, runs out in ~${runsOut}` : `${budgetLeftPct(c)}% of the budget`}
        />
      </div>

      <div className="mt-8 space-y-8">
        <Actions c={c} />
        <Charts c={c} />
        <section aria-labelledby="creators-title">
          <h2 id="creators-title" className="mb-3 font-semibold">
            Creators
          </h2>
          {c.submissions.length === 0 ? (
            <EmptyState title="No creators yet" description="Share the campaign link to get your first posts." />
          ) : (
            <div className="rounded-xl border bg-card shadow-sm">
              <DataList
                caption="Creators in this campaign"
                rows={[...c.submissions].sort((a, b) => Number(BigInt(b.paid) - BigInt(a.paid)))}
                rowKey={(s) => s.creator}
                columns={[
                  { key: "who", header: "Creator", mobile: "primary", cell: (s) => <AddressChip address={s.creator} name={s.profile?.name} avatar={s.profile?.avatar} /> },
                  {
                    key: "post",
                    header: "Post",
                    cell: (s) => (
                      <a href={s.url} target="_blank" rel="noreferrer nofollow" className="inline-flex max-w-40 min-w-0 items-center gap-1 text-muted-foreground hover:text-foreground sm:max-w-48">
                        <span className="truncate">{displayUrl(s.url)}</span>
                        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      </a>
                    ),
                  },
                  { key: "views", header: "Views", align: "right", cell: (s) => compactNumber(BigInt(s.views)) },
                  { key: "paid", header: "Paid", align: "right", cell: (s) => <Amount units={BigInt(s.paid)} decimals={c.decimals} /> },
                  {
                    key: "status",
                    header: "Status",
                    cell: (s) => {
                      const st = postStatus(c, s);
                      return (
                        <div>
                          <StatusPill status={st.status} />
                          {st.reason && <p className="mt-1 max-w-56 text-xs text-muted-foreground">{st.reason}</p>}
                        </div>
                      );
                    },
                  },
                ]}
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
