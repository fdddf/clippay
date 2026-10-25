// Sign in, by role (docs/ux-plan.md §5.8): creators get a passkey smart
// wallet (Face ID / Touch ID, no seed phrase, no fees); brands connect the
// Stellar wallet they have (Freighter), or use a passkey too.
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Fingerprint, Loader2, Megaphone, Video, Wallet as WalletIcon } from "lucide-react";
import { InfoHint } from "@/components/InfoHint";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Wallet } from "@/lib/wallet";
import { errorMessage } from "./errors";
import { loadWallet } from "./wallet";

export type Role = "creator" | "brand";
type Busy = "create" | "passkey" | "freighter" | null;

function Perk({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/** A small picture of what each role does: a clip earning coins, a megaphone paying out. */
function RoleArt({ role }: { role: Role }) {
  return (
    <span
      aria-hidden="true"
      className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-money/20 text-primary"
    >
      {role === "creator" ? <Video className="size-5" /> : <Megaphone className="size-5" />}
      <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-money text-[10px] font-bold text-white dark:text-background">
        ✦
      </span>
    </span>
  );
}

export function SignInDialog({
  open,
  initialRole,
  onDone,
}: {
  open: boolean;
  initialRole: Role | null;
  onDone: (w: Wallet | null, created?: boolean) => void;
}) {
  const [role, setRole] = useState<Role | null>(initialRole);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (open) {
      setRole(initialRole);
      setError(null);
      setCreating(false);
    }
  }, [open, initialRole]);

  async function run(kind: Exclude<Busy, null>, fn: (m: Awaited<ReturnType<typeof loadWallet>>) => Promise<Wallet>) {
    setBusy(kind);
    setError(null);
    try {
      const w = await fn(await loadWallet());
      setName("");
      onDone(w, kind === "create");
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

  const passkey = (
    <section aria-labelledby="signin-passkey" className="rounded-xl border p-4">
      <h3 id="signin-passkey" className="flex items-center gap-2 font-medium">
        <Fingerprint className="size-4 text-primary" aria-hidden="true" />
        Face ID wallet
        <InfoHint term="passkey" label="a passkey" />
      </h3>
      {creating ? (
        <form onSubmit={onCreate} className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="passkey-name">Name for this passkey</Label>
            <Input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Mia's iPhone" disabled={!!busy} autoFocus />
            <p className="text-xs text-muted-foreground">Helps you find it later in your device's passkey list.</p>
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
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button onClick={() => setCreating(true)} disabled={!!busy}>
              Create a wallet
            </Button>
            <Button variant="outline" onClick={() => run("passkey", (m) => m.connectPasskey())} disabled={!!busy}>
              {busy === "passkey" && <Loader2 className="animate-spin" aria-hidden="true" />}
              {busy === "passkey" ? "Waiting…" : "I have a passkey"}
            </Button>
          </div>
        </>
      )}
    </section>
  );

  const freighter = (
    <section aria-labelledby="signin-freighter" className="rounded-xl border p-4">
      <h3 id="signin-freighter" className="flex items-center gap-2 font-medium">
        <WalletIcon className="size-4 text-primary" aria-hidden="true" />
        Freighter
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        The Stellar wallet extension.{" "}
        <a href="https://www.freighter.app" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          Get Freighter
        </a>
      </p>
      <Button variant="outline" className="mt-3 w-full" onClick={() => run("freighter", (m) => m.connectFreighter())} disabled={!!busy}>
        {busy === "freighter" && <Loader2 className="animate-spin" aria-hidden="true" />}
        {busy === "freighter" ? "Check Freighter…" : "Connect Freighter"}
      </Button>
    </section>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onDone(null);
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          {role && !initialRole && (
            <button
              type="button"
              onClick={() => setRole(null)}
              disabled={!!busy}
              className="mb-1 inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </button>
          )}
          <DialogTitle>{role === "creator" ? "Sign in with a passkey" : role === "brand" ? "Sign in as a brand" : "Sign in to ClipPay"}</DialogTitle>
          <DialogDescription>
            {role === "creator"
              ? "Your wallet is your account. Payouts land in it directly."
              : role === "brand"
                ? "Connect the wallet that holds your campaign budget."
                : "Your wallet is your account — no email or password."}
          </DialogDescription>
        </DialogHeader>

        {role === null && (
          <div className="grid gap-3">
            {(
              [
                ["creator", "I make videos", "Get paid per verified view, cash out to your bank."],
                ["brand", "I run a brand", "Launch campaigns that pay only for real views."],
              ] as const
            ).map(([r, title, text]) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className="flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <RoleArt role={r} />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{text}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {role === "creator" && (
          <>
            <ul className="space-y-1.5">
              <Perk>Sign in with Face ID or a fingerprint</Perk>
              <Perk>No seed phrase to write down</Perk>
              <Perk>No fees — ClipPay covers them</Perk>
            </ul>
            {passkey}
            <p className="text-center text-xs text-muted-foreground">
              Already use Freighter?{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setRole("brand")} disabled={!!busy}>
                Connect it instead
              </button>
            </p>
          </>
        )}

        {role === "brand" && (
          <>
            {freighter}
            <p className="text-center text-xs text-muted-foreground">
              No Stellar wallet?{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setRole("creator")} disabled={!!busy}>
                Use a Face ID wallet
              </button>
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">ClipPay is on Stellar's test network: wallets hold test XLM with no real value.</p>
      </DialogContent>
    </Dialog>
  );
}
