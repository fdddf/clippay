// Sign in with a wallet: a passkey smart wallet (creators; no seed phrase, fees
// covered) or Freighter (brands with a Stellar wallet).
import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Wallet } from "@/lib/wallet";
import { errorMessage } from "./errors";
import { loadWallet } from "./wallet";

type Busy = "create" | "passkey" | "freighter" | null;

export function SignInDialog({ open, onDone }: { open: boolean; onDone: (w: Wallet | null) => void }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function run(kind: Exclude<Busy, null>, fn: (m: Awaited<ReturnType<typeof loadWallet>>) => Promise<Wallet>) {
    setBusy(kind);
    setError(null);
    try {
      const w = await fn(await loadWallet());
      setCreating(false);
      setName("");
      onDone(w);
    } catch (e) {
      setError(await errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    void run("create", (m) => m.createPasskeyWallet(name.trim()));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) {
          setError(null);
          onDone(null);
        }
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to ClipPay</DialogTitle>
          <DialogDescription>Your wallet is your account — no email or password.</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="signin-passkey" className="rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <KeyRound className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id="signin-passkey" className="font-medium">
                Passkey wallet <span className="ml-1 text-xs font-normal text-muted-foreground">for creators</span>
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Face ID, Touch ID or a security key. No seed phrase, and ClipPay pays the network fees.
              </p>
            </div>
          </div>
          {creating ? (
            <form onSubmit={onCreate} className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="passkey-name">Name for this passkey</Label>
                <Input
                  id="passkey-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. Mia's iPhone"
                  disabled={!!busy}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={!!busy}>
                  {busy === "create" && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {busy === "create" ? "Creating your wallet…" : "Create wallet"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={!!busy}>
                  Back
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button onClick={() => setCreating(true)} disabled={!!busy}>
                Create a wallet
              </Button>
              <Button variant="outline" onClick={() => run("passkey", (m) => m.connectPasskey())} disabled={!!busy}>
                {busy === "passkey" && <Loader2 className="animate-spin" aria-hidden="true" />}
                {busy === "passkey" ? "Waiting…" : "I have a passkey"}
              </Button>
            </div>
          )}
        </section>

        <section aria-labelledby="signin-freighter" className="rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <WalletIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="signin-freighter" className="font-medium">
                Freighter <span className="ml-1 text-xs font-normal text-muted-foreground">for brands</span>
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Use the Stellar wallet extension you already have.</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => run("freighter", (m) => m.connectFreighter())}
            disabled={!!busy}
          >
            {busy === "freighter" && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy === "freighter" ? "Check Freighter…" : "Connect Freighter"}
          </Button>
        </section>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          ClipPay is on Stellar's test network: wallets hold test XLM with no real value.
        </p>
      </DialogContent>
    </Dialog>
  );
}
