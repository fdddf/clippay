// /new — launch a campaign in three steps (docs/ux-plan.md §5.5): the brief,
// the budget, then a review before the budget is locked. A live preview of
// the marketplace card sits alongside; the draft survives a reload.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CampaignCard } from "@/components/CampaignCard";
import { TxProgress, useTxProgress } from "@/components/TxProgress";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Campaign } from "@/lib/api-types";
import { formatUnits } from "@/lib/format";
import { config } from "@/lib/network";
import { cn } from "@/lib/utils";
import { AppLink } from "../AppLink";
import { ShareMenu } from "../campaign/ShareMenu";
import { errorMessage } from "../errors";
import { BriefStep } from "../new/BriefStep";
import { BudgetStep } from "../new/BudgetStep";
import { ReviewStep } from "../new/ReviewStep";
import { DEFAULT_DRAFT, briefErrors, budgetErrors, loadDraft, previewCampaign, saveDraft, toBrief, type Draft } from "../new/draft";
import { keys, useAccount, useBalance } from "../queries";
import { useTitle } from "../useTitle";
import { loadWallet, useWallet } from "../wallet";

const STEPS = ["Brief", "Budget", "Review"] as const;

function Stepper({ step, done, go }: { step: number; done: boolean[]; go: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4" aria-label="Steps">
      {STEPS.map((label, i) => {
        const current = i === step;
        const reachable = i < step || done.slice(0, i).every(Boolean);
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-4">
            {i > 0 && <span aria-hidden="true" className="h-px w-6 bg-border sm:w-10" />}
            <button
              type="button"
              disabled={!reachable || current}
              onClick={() => go(i)}
              aria-current={current ? "step" : undefined}
              className="flex items-center gap-2 rounded-md text-sm disabled:cursor-default focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full border text-xs font-semibold tabular",
                  current && "border-primary bg-primary text-primary-foreground",
                  !current && i < step && "border-transparent bg-ok text-white dark:text-background",
                )}
              >
                {!current && i < step ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn("hidden sm:inline", current ? "font-medium" : "text-muted-foreground")}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Launched({ c, onAnother }: { c: Campaign; onAnother: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-6">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
        <PartyPopper className="size-6" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">Your campaign is live</h1>
      <p className="mt-3 text-muted-foreground">
        {formatUnits(BigInt(c.budget), c.decimals, 2)} {config.tokenSymbol} is locked in escrow. Share the link with
        creators — each post is checked about every minute and paid automatically.
      </p>
      <div className="mx-auto mt-8 max-w-sm text-left">
        <CampaignCard c={c} />
      </div>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <AppLink href={`/c/${c.id}`} className={buttonVariants({ size: "lg" })}>
          View campaign
          <ArrowRight aria-hidden="true" />
        </AppLink>
        <ShareMenu c={c} />
      </div>
      <button type="button" onClick={onAnother} className="mt-6 text-sm font-medium text-primary hover:underline">
        Launch another campaign
      </button>
    </div>
  );
}

export default function NewCampaign() {
  useTitle("Launch a campaign");
  const { wallet, connect } = useWallet();
  const account = useAccount(wallet?.address);
  const balance = useBalance(wallet?.address);
  const queryClient = useQueryClient();
  const tx = useTxProgress();
  const [d, setD] = useState<Draft>(loadDraft);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState([false, false]);
  const [launched, setLaunched] = useState<Campaign | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    saveDraft(d);
  }, [d]);

  // Prefill the brand from the account's profile.
  const profile = account.data?.profile;
  useEffect(() => {
    if (!profile) return;
    // Only into an empty brand: never mix a profile's logo with another name.
    setD((x) =>
      x.brandName || x.logo
        ? x
        : { ...x, brandName: profile.name ?? "", logo: profile.avatar?.split("/").pop() || null },
    );
  }, [profile]);

  const bErrors = useMemo(() => briefErrors(d), [d]);
  const budget = useMemo(() => budgetErrors(d, balance.data ?? null), [d, balance.data]);
  const done = [Object.keys(bErrors).length === 0, budget.amounts !== null];
  const preview = useMemo(() => previewCampaign(d, wallet?.address ?? "preview"), [d, wallet?.address]);
  const busy = !!tx.state && !tx.state.done && !tx.state.error;

  const next = () => {
    setTouched((t) => t.map((v, i) => (i === step ? true : v)));
    if (!done[step]) {
      // Move focus to the first problem.
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setStep((s) => s + 1);
    scrollTo({ top: 0, behavior: "smooth" });
  };

  async function launch() {
    const w = wallet ?? (await connect("brand"));
    if (!w || !budget.amounts) return;
    const a = budget.amounts;
    const brand = w.address;
    const id = await tx.run(async (step) => {
      try {
        const have = await (await import("@/lib/stellar")).tokenBalance(brand).catch(() => null);
        if (have !== null && have < a.budget) {
          throw new Error(`This wallet holds ${formatUnits(have, config.tokenDecimals, 2)} ${config.tokenSymbol} — lower the budget or add funds first`);
        }
        // Store the brief by its hash; the on-chain link pins that exact version.
        const { hash } = await api.createBrief(toBrief(d));
        const briefUrl = `${config.siteUrl}/b/${hash}`;
        const m = await loadWallet();
        step("sign");
        const sent = await m.sendAs(w, (client) =>
          client.create_campaign({
            brand,
            token: config.tokenId,
            title: d.title.trim(),
            brief_url: briefUrl,
            budget: a.budget,
            rate_per_1k: a.rate,
            cap_per_creator: a.cap,
            deadline: BigInt(a.deadline),
          }),
        );
        step("confirm");
        const { pool } = await import("@/lib/stellar");
        const { unwrap } = await import("@clippay/pool-client");
        if (sent.result) return { hash: sent.hash, value: unwrap(sent.result) };
        // Passkey submissions don't return the new id: find our campaign among the latest.
        const client = await pool();
        const count = (await client.campaign_count()).result;
        for (let i = count - 1; i >= Math.max(0, count - 10); i--) {
          const c = unwrap((await client.get_campaign({ id: i })).result);
          if (c.brand === brand && c.brief_url === briefUrl) return { hash: sent.hash, value: i };
        }
        throw new Error("The campaign was created, but it isn't showing yet — check your dashboard in a minute");
      } catch (e) {
        throw new Error(await errorMessage(e));
      }
    });
    if (id === undefined) return;
    saveDraft(null);
    const c = await api.campaign(id, true).catch(() => null);
    void queryClient.invalidateQueries({ queryKey: keys.campaigns });
    void queryClient.invalidateQueries({ queryKey: ["balance"] });
    if (c) {
      setLaunched(c);
      scrollTo({ top: 0 });
    } else {
      toast.success(`Campaign #${id} is live`);
    }
  }

  if (launched) {
    return (
      <Launched
        c={launched}
        onAnother={() => {
          setLaunched(null);
          setD(DEFAULT_DRAFT);
          setStep(0);
          setTouched([false, false]);
          tx.reset();
        }}
      />
    );
  }

  return (
    <>
      <section className="border-b bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Launch a campaign</h1>
            <p className="mt-2 text-muted-foreground">Pay creators only for views that happen. Takes about three minutes.</p>
          </div>
          <Stepper step={step} done={done} go={setStep} />
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 2) next();
            else void launch();
          }}
          className="min-w-0"
          aria-label={`Step ${step + 1} of 3: ${STEPS[step]}`}
        >
          <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
            {step === 0 && <BriefStep d={d} set={set} errors={touched[0] ? bErrors : {}} />}
            {step === 1 && (
              <BudgetStep d={d} set={set} errors={touched[1] ? budget.errors : {}} wallet={wallet} balance={balance.data} />
            )}
            {step === 2 && budget.amounts && <ReviewStep d={d} a={budget.amounts} wallet={wallet} />}
            {tx.state && step === 2 && (
              <TxProgress
                state={tx.state}
                signLabel={wallet?.kind === "passkey" ? "Confirm with your passkey" : "Confirm in Freighter"}
                className="mt-6 rounded-xl border p-4"
              />
            )}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <Button type="submit" size="lg">
                Continue
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button type="submit" size="lg" disabled={busy || !budget.amounts}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {!wallet
                  ? "Sign in & launch"
                  : `Lock ${budget.amounts ? formatUnits(budget.amounts.budget, config.tokenDecimals, 2) : ""} ${config.tokenSymbol} & launch`}
              </Button>
            )}
          </div>
        </form>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-labelledby="preview-title">
          <h2 id="preview-title" className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Eye className="size-4" aria-hidden="true" />
            How creators will see it
          </h2>
          {/* A picture of the card: not a link you can follow yet. */}
          <div inert className="select-none">
            <CampaignCard c={preview} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Your draft is saved in this browser until you launch.
          </p>
        </aside>
      </div>
    </>
  );
}
