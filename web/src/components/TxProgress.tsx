import { useCallback, useState } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { explorer } from "@/lib/network";
import { cn } from "@/lib/utils";

export type TxStep = "prepare" | "sign" | "submit" | "confirm";
const ORDER: TxStep[] = ["prepare", "sign", "submit", "confirm"];

export interface TxState {
  step: TxStep;
  error?: string;
  hash?: string;
  done?: boolean;
}

/**
 * Drives a TxProgress: `run` calls your flow with a `step` callback; the
 * state ends `done` (with the hash) or with the error message.
 */
export function useTxProgress() {
  const [state, setState] = useState<TxState | null>(null);
  const run = useCallback(
    async <T,>(flow: (step: (s: TxStep) => void) => Promise<{ hash?: string; value: T }>): Promise<T | undefined> => {
      let current: TxStep = "prepare";
      setState({ step: current });
      try {
        const { hash, value } = await flow((s) => {
          current = s;
          setState({ step: s });
        });
        setState({ step: "confirm", hash, done: true });
        return value;
      } catch (e) {
        setState({ step: current, error: e instanceof Error ? e.message : String(e) });
        return undefined;
      }
    },
    [],
  );
  return { state, run, reset: () => setState(null) };
}

/** Prepare → sign → submit → confirmed, so waiting never looks like hanging. */
export function TxProgress({
  state,
  signLabel = "Confirm in your wallet",
  className,
}: {
  state: TxState;
  signLabel?: string;
  className?: string;
}) {
  const labels: Record<TxStep, string> = {
    prepare: "Preparing",
    sign: signLabel,
    submit: "Sending to Stellar",
    confirm: "Confirmed",
  };
  const at = ORDER.indexOf(state.step);
  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite">
      <ol className="space-y-2">
        {ORDER.map((s, i) => {
          const done = state.done || i < at;
          const active = !state.done && i === at;
          const failed = active && !!state.error;
          return (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                  done && "border-transparent bg-ok text-white dark:text-background",
                  active && !failed && "border-primary text-primary",
                  failed && "border-transparent bg-destructive text-white",
                  !done && !active && "text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : failed ? (
                  <X className="size-3.5" />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <span className={cn(!done && !active && "text-muted-foreground", active && "font-medium")}>
                {labels[s]}
              </span>
            </li>
          );
        })}
      </ol>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.hash && (
        <a
          href={explorer.tx(state.hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View receipt <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}
