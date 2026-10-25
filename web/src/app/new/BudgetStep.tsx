// Step 2: how much, how fast, for how long — with the numbers worked out.
import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, ExternalLink } from "lucide-react";
import { Amount } from "@/components/Amount";
import { Field } from "@/components/Field";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compactNumber, parseUnits, timeLeft } from "@/lib/format";
import { config } from "@/lib/network";
import { cn } from "@/lib/utils";
import type { Wallet } from "../wallet";
import { deadlineOf, type Draft, type Errors } from "./draft";

const DURATIONS = [
  ["1", "1 day"],
  ["7", "7 days"],
  ["14", "14 days"],
  ["30", "30 days"],
] as const;

function MoneyInput({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return (
    <div className="relative">
      <Input {...rest} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} className="pr-14 tabular" />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{config.tokenSymbol}</span>
    </div>
  );
}

export function BudgetStep({
  d,
  set,
  errors,
  wallet,
  balance,
}: {
  d: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  errors: Errors;
  wallet: Wallet | null;
  balance: bigint | null | undefined;
}) {
  const dec = config.tokenDecimals;
  const budget = parseUnits(d.budget, dec);
  const rate = parseUnits(d.rate, dec);
  const cap = parseUnits(d.cap, dec);
  const keep = (u: bigint) => u - (u * BigInt(config.feeBps)) / 10_000n;
  const views = budget && rate ? (budget * 1000n) / rate : null;
  const creators = budget && cap ? budget / cap : null;
  const deadline = deadlineOf(d);
  const endDate = d.endDate ? new Date(`${d.endDate}T00:00`) : undefined;
  const [picking, setPicking] = useState(false);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <div className="space-y-8">
      <section aria-labelledby="budget-money" className="space-y-5">
        <h2 id="budget-money" className="text-lg font-semibold">
          Budget
        </h2>
        <Field
          id="budget"
          label="Total budget"
          error={errors.budget}
          hint={
            wallet && balance !== undefined && balance !== null ? (
              <>
                Your wallet holds <Amount units={balance} />. The budget is locked in escrow until the campaign ends.
              </>
            ) : (
              "Locked in escrow until the campaign ends; whatever isn't paid out comes back to you."
            )
          }
        >
          <MoneyInput value={d.budget} onChange={(v) => set("budget", v)} />
        </Field>
        {errors.budget === "More than your wallet holds" && (
          <p className="-mt-3 text-xs text-muted-foreground">
            Need test {config.tokenSymbol}? Fund a Freighter account from{" "}
            <a
              href="https://lab.stellar.org/account/fund?$=network$id=testnet"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              Stellar Lab's friendbot <ExternalLink className="size-3" aria-hidden="true" />
            </a>
            , then send some to this wallet.
          </p>
        )}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="rate" label="Pay per 1,000 views" error={errors.rate} hint="What a creator earns for each 1,000 verified views.">
            <MoneyInput value={d.rate} onChange={(v) => set("rate", v)} />
          </Field>
          <Field id="cap" label="Max per creator" error={errors.cap} hint="Stops one viral post from taking the whole budget.">
            <MoneyInput value={d.cap} onChange={(v) => set("cap", v)} />
          </Field>
        </div>
      </section>

      <section aria-labelledby="budget-time" className="space-y-4">
        <h2 id="budget-time" className="text-lg font-semibold">
          How long it runs
        </h2>
        <div role="radiogroup" aria-label="Duration" className="flex flex-wrap gap-2">
          {DURATIONS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={d.duration === v}
              onClick={() => set("duration", v)}
              className="rounded-lg border px-3.5 py-2 text-sm transition-colors hover:bg-accent aria-checked:border-primary aria-checked:bg-accent aria-checked:font-medium aria-checked:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {l}
            </button>
          ))}
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={d.duration === "custom"}
                className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors hover:bg-accent aria-checked:border-primary aria-checked:bg-accent aria-checked:font-medium aria-checked:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <CalendarDays className="size-4" aria-hidden="true" />
                {d.duration === "custom" && endDate ? format(endDate, "MMM d, yyyy") : "Pick a date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                disabled={{ before: tomorrow }}
                onSelect={(day) => {
                  if (!day) return;
                  set("endDate", format(day, "yyyy-MM-dd"));
                  set("duration", "custom");
                  setPicking(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        {errors.endDate ? (
          <p className="text-xs text-destructive">{errors.endDate}</p>
        ) : (
          deadline && (
            <p className="text-sm text-muted-foreground">
              Ends <span className="font-medium text-foreground">{format(new Date(deadline * 1000), "EEE, MMM d 'at' h:mm a")}</span>
              {" "}({timeLeft(deadline)} from now). Views keep being paid for {Math.round(config.settleGrace / 60)} minutes after that.
            </p>
          )
        )}
      </section>

      <section aria-labelledby="budget-math" className="rounded-xl border bg-muted/40 p-5">
        <h2 id="budget-math" className="font-semibold">
          What this buys
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Verified views, at most</dt>
            <dd className="mt-1 text-xl font-semibold tabular">{views !== null ? compactNumber(views) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Creators at the max</dt>
            <dd className="mt-1 text-xl font-semibold tabular">{creators !== null ? creators.toLocaleString("en-US") : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Creators receive per 1k</dt>
            <dd className={cn("mt-1 text-xl font-semibold", rate && "text-money")}>
              {rate ? <Amount units={keep(rate)} className="text-money" /> : "—"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          ClipPay's {config.feeBps / 100}% fee comes out of each payout, so you only pay for views that happen. Nothing is
          charged on the unspent budget.
        </p>
      </section>
    </div>
  );
}
