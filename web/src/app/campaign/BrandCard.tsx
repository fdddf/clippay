// The right-hand card for the campaign's brand: budget, sharing, a manual
// view check and the refund once the campaign has settled.
import { useState } from "react";
import { Loader2, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Amount } from "@/components/Amount";
import { TxProgress, useTxProgress } from "@/components/TxProgress";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { CampaignDetail } from "@/lib/api-types";
import { formatUnits, timeLeft } from "@/lib/format";
import { config } from "@/lib/network";
import { errorMessage } from "../errors";
import { keys } from "../queries";
import { loadWallet, useWallet } from "../wallet";
import { budgetLeftPct } from "@/components/CampaignCard";
import { ShareMenu } from "./ShareMenu";
import { useNow } from "./shared";

export function BrandCard({ c }: { c: CampaignDetail }) {
  const { wallet } = useWallet();
  const queryClient = useQueryClient();
  const tx = useTxProgress();
  const now = useNow(30_000);
  const [checking, setChecking] = useState(false);
  const sym = config.tokenSymbol;
  const remaining = BigInt(c.remaining);
  const left = budgetLeftPct(c);
  const canRefund = !c.refunded && remaining > 0n && now > c.refundAt;
  const refundIn = !c.refunded && remaining > 0n && now <= c.refundAt ? timeLeft(c.refundAt, now) : null;
  const busy = !!tx.state && !tx.state.done && !tx.state.error;

  async function checkNow() {
    setChecking(true);
    try {
      const { results } = await api.checkViews(c.id);
      const paid = results.reduce((n, r) => n + BigInt(r.paid ?? "0"), 0n);
      const held = results.filter((r) => r.skipped?.match(/hold|review|rejected/)).length;
      toast.success(`Paid ${formatUnits(paid, c.decimals, 2)} ${sym} to creators`, {
        description: held ? `${held} post(s) on hold` : undefined,
      });
      queryClient.setQueryData(keys.campaign(c.id), await api.campaign(c.id, true));
    } catch (e) {
      toast.error(await errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  async function refund() {
    if (!wallet) return;
    const ok = await tx.run(async (step) => {
      const m = await loadWallet();
      step("sign");
      try {
        const { hash } = await m.sendAs(wallet, (client) => client.refund({ id: c.id }));
        return { hash, value: true };
      } catch (err) {
        throw new Error(await errorMessage(err));
      }
    });
    if (!ok) return;
    toast.success(`Refunded ${formatUnits(remaining, c.decimals, 2)} ${sym}`);
    queryClient.setQueryData(keys.campaign(c.id), await api.campaign(c.id, true).catch(() => undefined));
    void queryClient.invalidateQueries({ queryKey: keys.campaign(c.id) });
  }

  return (
    <section aria-labelledby="brand-title" className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 id="brand-title" className="font-semibold">
        Your campaign
      </h2>
      <div className="mt-4 rounded-xl bg-muted/60 p-4">
        <p className="text-sm text-muted-foreground">Budget left</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight">
          <Amount units={remaining} decimals={c.decimals} />
        </p>
        <div
          role="progressbar"
          aria-label="Budget left"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={left}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-background"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${left}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          of <Amount units={BigInt(c.budget)} decimals={c.decimals} maxFrac={0} /> ·{" "}
          <Amount units={BigInt(c.paid)} decimals={c.decimals} /> paid to creators
        </p>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Share this page with creators. Each post is checked about every minute and paid from your budget; whatever
        isn't earned comes back to you.
      </p>
      <div className="mt-4 grid gap-2">
        <ShareMenu c={c} variant="default" />
        {(c.status === "live" || c.status === "ending" || c.status === "settling") && (
          <Button variant="outline" onClick={checkNow} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            Check views now
          </Button>
        )}
        {!c.refunded && remaining > 0n && (
          <Button variant="outline" onClick={refund} disabled={!canRefund || busy}>
            <Undo2 aria-hidden="true" />
            Refund {formatUnits(remaining, c.decimals, 2)} {sym}
          </Button>
        )}
      </div>
      {refundIn && (
        <p className="mt-2 text-xs text-muted-foreground">
          Refunds open {refundIn} from now, once the last views are paid.
        </p>
      )}
      {c.refunded && <p className="mt-2 text-xs text-muted-foreground">The unspent budget was refunded to you.</p>}
      {tx.state && (
        <TxProgress
          state={tx.state}
          signLabel={wallet?.kind === "passkey" ? "Confirm with your passkey" : "Confirm in Freighter"}
          className="mt-4 rounded-xl border p-4"
        />
      )}
    </section>
  );
}
