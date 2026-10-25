// Cash out to a bank through a SEP-24 anchor, as four steps: amount → bank
// details (in the anchor's window) → confirm the transfer → on its way.
import { InfoHint } from "@/components/InfoHint";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import type { Anchor, Sep24Transaction, WithdrawLimits } from "@clippay/anchor";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { anchorAssetCode, config, explorer } from "@/lib/network";
import { cn } from "@/lib/utils";
import { errorMessage } from "../errors";
import { loadWallet, type Wallet } from "../wallet";

type Step =
  | { name: "amount" }
  | { name: "auth" }
  | { name: "bank"; url: string; opened: boolean }
  | { name: "confirm"; tx: Sep24Transaction }
  | { name: "paying"; tx: Sep24Transaction; hash?: string }
  | { name: "done"; tx: Sep24Transaction; hash: string };

const STEPS = ["Amount", "Bank details", "Confirm", "On its way"];
const index = (s: Step) => ({ amount: 0, auth: 1, bank: 1, confirm: 2, paying: 3, done: 3 })[s.name];
const fiat = (asset?: string) => asset?.replace(/^iso4217:/, "") ?? "";
const loadAnchorLib = () => import("@clippay/anchor");

export function CashOut({
  wallet,
  balance,
  onPaid,
}: {
  wallet: Wallet;
  balance: bigint | undefined;
  onPaid: (amount: string, received: string, hash: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>({ name: "amount" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ anchor: Anchor; limits: WithdrawLimits } | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const session = useRef<{ anchor: Anchor; jwt: string; id: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sym = config.tokenSymbol;

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => {
    let live = true;
    loadAnchorLib()
      .then(async (m) => {
        const anchor = await m.loadAnchor(config.anchorDomain);
        return { anchor, limits: await m.withdrawLimits(anchor, anchorAssetCode) };
      })
      .then((i) => live && setInfo(i))
      .catch(async (e) => live && setInfoError(await errorMessage(e)));
    return () => {
      live = false;
    };
  }, []);

  const fail = async (e: unknown) => {
    stop();
    setStep({ name: "amount" });
    setError(await errorMessage(e));
  };

  /** Poll the anchor until the withdrawal reaches a status `until` accepts. */
  const poll = (until: (tx: Sep24Transaction) => boolean, then: (tx: Sep24Transaction) => void) => {
    stop();
    timer.current = setInterval(async () => {
      const s = session.current;
      if (!s) return;
      try {
        const tx = await (await loadAnchorLib()).getTransaction(s.anchor, s.jwt, s.id);
        if (["error", "expired", "refunded", "no_market"].includes(tx.status)) throw new Error(tx.message || `Withdrawal ${tx.status}`);
        if (until(tx)) {
          stop();
          then(tx);
        }
      } catch (e) {
        void fail(e);
      }
    }, 4000);
  };

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!info) return;
    const lib = await loadAnchorLib();
    const problem = lib.checkWithdrawAmount(info.limits, Number(amount), balance === undefined ? null : Number(balance) / 10 ** config.tokenDecimals, sym);
    setError(problem);
    if (problem) return;
    // Open the anchor's window inside the click so popup blockers allow it.
    const popup = window.open("about:blank", "clippay-anchor", "width=480,height=760");
    setStep({ name: "auth" });
    try {
      const w = await loadWallet();
      const jwt = await w.anchorLogin(wallet, info.anchor);
      const started = await lib.startWithdraw(info.anchor, jwt, { assetCode: anchorAssetCode, account: wallet.address, amount });
      session.current = { anchor: info.anchor, jwt, id: started.id };
      if (popup) popup.location.href = started.url;
      setStep({ name: "bank", url: started.url, opened: !!popup && !popup.closed });
      poll((tx) => tx.status === "pending_user_transfer_start", (tx) => setStep({ name: "confirm", tx }));
    } catch (err) {
      popup?.close();
      void fail(err);
    }
  }

  async function confirm(tx: Sep24Transaction) {
    setStep({ name: "paying", tx });
    try {
      const hash = await (await loadWallet()).payAnchor(wallet, tx);
      setStep({ name: "paying", tx, hash });
      poll(
        (t) => t.status === "completed" || t.status === "pending_external",
        (t) => {
          setStep({ name: "done", tx: t, hash });
          onPaid(amount, `${t.amount_out ?? ""} ${fiat(t.amount_out_asset)}`.trim(), hash);
        },
      );
    } catch (err) {
      void fail(err);
    }
  }

  const at = index(step);
  const limits = info?.limits;
  const range =
    limits?.min !== undefined && limits.max !== undefined
      ? `${limits.min}–${limits.max} ${sym}`
      : limits?.min !== undefined
        ? `from ${limits.min} ${sym}`
        : limits?.max !== undefined
          ? `up to ${limits.max} ${sym}`
          : null;

  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Cash-out steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === at ? "step" : undefined}>
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full border text-xs font-semibold",
                i < at || step.name === "done" ? "border-transparent bg-ok text-white dark:text-background" : i === at ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {i < at || step.name === "done" ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={i === at ? "font-medium" : "text-muted-foreground"}>{s}</span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="hidden h-px w-6 bg-border sm:block" />}
          </li>
        ))}
      </ol>

      <div className="mt-6" aria-live="polite">
        {step.name === "amount" && (
          <form onSubmit={start} noValidate className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Withdraw through <span className="font-medium text-foreground">{config.anchorDomain}</span>, a Stellar anchor{" "}
              <InfoHint term="anchor" label="an anchor" /> that pays out to bank accounts. You'll enter your bank details on the anchor's own page; ClipPay never sees them.
            </p>
            {infoError ? (
              <p role="alert" className="text-sm text-destructive">
                Couldn't reach the anchor: {infoError}
              </p>
            ) : !info ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Checking the anchor's limits…
              </p>
            ) : !limits?.enabled ? (
              <p role="alert" className="text-sm text-destructive">
                This anchor doesn't pay out {sym} right now.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="cashout-amount">Amount</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="cashout-amount"
                        inputMode="decimal"
                        autoComplete="off"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setError(null);
                        }}
                        aria-invalid={!!error || undefined}
                        aria-describedby="cashout-hint"
                        className="pr-12 tabular"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{sym}</span>
                    </div>
                    <Button type="submit">Continue</Button>
                  </div>
                  <p id="cashout-hint" className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {error ?? (range ? `The anchor accepts ${range} per withdrawal.` : "Enter how much to withdraw.")}
                  </p>
                </div>
              </>
            )}
          </form>
        )}
        {step.name === "auth" && (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Confirm with your passkey to sign in to the anchor…
          </p>
        )}
        {step.name === "bank" && (
          <div className="space-y-3">
            <p className="text-sm">
              {step.opened
                ? "Enter your bank details in the anchor's window. This page moves on by itself once you're done."
                : "Your browser blocked the anchor's window. Open it to enter your bank details; this page moves on once you're done."}
            </p>
            <a href={step.url} target="clippay-anchor" rel="noreferrer" className={buttonVariants({ variant: step.opened ? "outline" : "default" })}>
              {step.opened ? "Reopen the anchor's form" : "Open the anchor's form"}
              <ExternalLink aria-hidden="true" />
            </a>
          </div>
        )}
        {step.name === "confirm" && (
          <div className="space-y-4">
            <dl className="divide-y rounded-lg border text-sm">
              <div className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted-foreground">You send</dt>
                <dd className="font-medium tabular">
                  {step.tx.amount_in} {sym}
                </dd>
              </div>
              {step.tx.fee_details && (
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">Anchor fee</dt>
                  <dd className="tabular">
                    {step.tx.fee_details.total} {sym}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted-foreground">Your bank receives</dt>
                <dd className="font-semibold tabular">
                  {step.tx.amount_out} {fiat(step.tx.amount_out_asset)}
                </dd>
              </div>
            </dl>
            <Button onClick={() => void confirm(step.tx)}>Confirm with passkey</Button>
          </div>
        )}
        {step.name === "paying" && (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {step.hash ? (
              <>
                Sent. Waiting for the anchor to pay out…{" "}
                <a href={explorer.tx(step.hash)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Receipt
                </a>
              </>
            ) : (
              "Confirm the transfer with your passkey…"
            )}
          </p>
        )}
        {step.name === "done" && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-semibold">
                {step.tx.amount_out} {fiat(step.tx.amount_out_asset)}
              </span>{" "}
              is on its way to your bank.{" "}
              <a href={explorer.tx(step.hash)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Receipt
              </a>
            </p>
            <Button variant="outline" onClick={() => (setAmount(""), setStep({ name: "amount" }))}>
              Cash out again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
