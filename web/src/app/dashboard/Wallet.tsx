// The wallet tab: balance, cash out to a bank, send to an address, and the
// withdrawals made from this device.
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, Landmark, Send } from "lucide-react";
import { toast } from "sonner";
import { AddressChip } from "@/components/AddressChip";
import { Amount } from "@/components/Amount";
import { TxProgress, useTxProgress } from "@/components/TxProgress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseUnits, shortAddress } from "@/lib/format";
import { config, explorer } from "@/lib/network";
import { errorMessage } from "../errors";
import { useTitle } from "../useTitle";
import { loadWallet } from "../wallet";
import { CashOut } from "./CashOut";
import { addHistory, loadHistory, type Withdrawal } from "./history";
import { PageHeader, useDashboard } from "./Layout";

const ADDRESS = /^[GC][A-Z2-7]{55}$/;

function SendForm({ onSent }: { onSent: (w: Withdrawal) => void }) {
  const { wallet, balance } = useDashboard();
  const tx = useTxProgress();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);
  const sym = config.tokenSymbol;
  const units = parseUnits(amount, config.tokenDecimals);
  const toError = !to.trim() ? "Paste a Stellar address" : !ADDRESS.test(to.trim()) ? "That isn't a Stellar address (G… or C…, 56 characters)" : to.trim() === wallet.address ? "That's this wallet" : null;
  const amountError = !units ? "Enter an amount above zero" : balance !== undefined && units > balance ? "More than your balance" : null;
  const busy = !!tx.state && !tx.state.done && !tx.state.error;
  // Big transfers get a second look.
  const big = !!units && balance !== undefined && (units * 2n > balance || units > 100n * 10n ** BigInt(config.tokenDecimals));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (toError || amountError) return;
    if (big) setConfirming(true);
    else void send();
  };

  async function send() {
    setConfirming(false);
    const dest = to.trim();
    const value = amount.trim();
    const hash = await tx.run(async (step) => {
      const m = await loadWallet();
      step("sign");
      try {
        const h = await m.withdraw(wallet, dest, Number(value));
        return { hash: h, value: h };
      } catch (err) {
        throw new Error(await errorMessage(err));
      }
    });
    if (!hash) return;
    toast.success(`Sent ${value} ${sym}`);
    onSent({ kind: "address", amount: value, to: dest, hash, ts: Math.floor(Date.now() / 1000) });
    setTo("");
    setAmount("");
    setTouched(false);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted-foreground">Send {sym} to any Stellar address, such as an exchange deposit address.</p>
      <div className="space-y-1.5">
        <Label htmlFor="send-to">To</Label>
        <Input
          id="send-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="G… or C…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-sm"
          aria-invalid={(touched && !!toError) || undefined}
          aria-describedby={touched && toError ? "send-to-error" : undefined}
        />
        {touched && toError && (
          <p id="send-to-error" className="text-xs text-destructive">
            {toError}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="send-amount">Amount</Label>
        <div className="relative">
          <Input
            id="send-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="pr-12 tabular"
            aria-invalid={(touched && !!amountError) || undefined}
            aria-describedby="send-amount-hint"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{sym}</span>
        </div>
        <p id="send-amount-hint" className={touched && amountError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {touched && amountError ? amountError : balance !== undefined ? <>Available: <Amount units={balance} /></> : " "}
        </p>
      </div>
      <Button type="submit" disabled={busy}>
        <Send aria-hidden="true" />
        Send
      </Button>
      {tx.state && <TxProgress state={tx.state} signLabel="Confirm with your passkey" className="rounded-lg border p-4" />}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send {amount} {sym}?</DialogTitle>
            <DialogDescription>Transfers on Stellar can't be reversed. Check the address before you confirm.</DialogDescription>
          </DialogHeader>
          <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all">{to.trim()}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void send()}>Send {amount} {sym}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

export default function WalletPage() {
  useTitle("Wallet");
  const { wallet, balance } = useDashboard();
  const queryClient = useQueryClient();
  const [history, setHistory] = useState(() => loadHistory(wallet.address));
  const record = (w: Withdrawal) => {
    setHistory(addHistory(wallet.address, w));
    void queryClient.invalidateQueries({ queryKey: ["balance"] });
  };
  const canMove = wallet.kind === "passkey" || wallet.kind === "watch";

  return (
    <>
      <PageHeader title="Wallet" description="Your earnings land here. Cash out to a bank or send them anywhere on Stellar." />
      <section aria-labelledby="balance-title" className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 id="balance-title" className="text-sm text-muted-foreground">
          Balance
        </h2>
        <p className="mt-1 text-3xl font-semibold tracking-tight">{balance !== undefined ? <Amount units={balance} /> : "—"}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
          <span className="text-muted-foreground">{wallet.kind === "passkey" ? "Face ID wallet" : wallet.kind === "freighter" ? "Freighter" : "Read-only preview"}</span>
          <AddressChip address={wallet.address} size="sm" />
        </div>
      </section>

      {canMove ? (
        <Tabs defaultValue="bank" className="mt-8">
          <TabsList>
            <TabsTrigger value="bank">
              <Landmark aria-hidden="true" />
              Cash out to bank
            </TabsTrigger>
            <TabsTrigger value="address">
              <Send aria-hidden="true" />
              Send to address
            </TabsTrigger>
          </TabsList>
          <TabsContent value="bank" className="mt-4 rounded-xl border bg-card p-5 shadow-sm">
            <CashOut
              wallet={wallet}
              balance={balance}
              onPaid={(amount, received, hash) => record({ kind: "bank", amount, to: received, hash, ts: Math.floor(Date.now() / 1000) })}
            />
          </TabsContent>
          <TabsContent value="address" className="mt-4 rounded-xl border bg-card p-5 shadow-sm">
            <SendForm onSent={record} />
          </TabsContent>
        </Tabs>
      ) : (
        <p className="mt-8 rounded-xl border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          This is a Freighter wallet: send or cash out from Freighter itself. Cashing out to a bank from ClipPay works with
          Face ID wallets.
        </p>
      )}

      <section aria-labelledby="history-title" className="mt-8">
        <h2 id="history-title" className="font-semibold">
          Withdrawals
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Only withdrawals made on this device are listed here. Each date opens the transfer's receipt.</p>
        {history.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No withdrawals yet.</p>
        ) : (
          <ul className="mt-4 divide-y rounded-xl border bg-card shadow-sm">
            {history.map((h) => (
              <li key={h.hash} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium tabular">
                    {h.amount} {config.tokenSymbol}
                  </span>{" "}
                  {h.kind === "bank" ? <>to your bank{h.to ? ` (${h.to})` : ""}</> : <>to {shortAddress(h.to)}</>}
                </span>
                <a href={explorer.tx(h.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label={`Receipt, ${format(new Date(h.ts * 1000), "MMM d, HH:mm")}`}>
                  {format(new Date(h.ts * 1000), "MMM d, HH:mm")}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
