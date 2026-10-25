// Shown once, right after someone creates a passkey wallet: where it lives,
// how money gets out, and what happens if they change devices.
import { Fingerprint, Landmark, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { shortAddress } from "@/lib/format";
import { AppLink } from "./AppLink";

const KEY = "clippay.welcomed.";

export function shouldWelcome(address: string): boolean {
  try {
    return localStorage.getItem(KEY + address) === null;
  } catch {
    return false;
  }
}

export function WelcomeDialog({ address, onClose }: { address: string | null; onClose: () => void }) {
  const close = () => {
    try {
      if (address) localStorage.setItem(KEY + address, "1");
    } catch {}
    onClose();
  };
  const items = [
    {
      icon: Fingerprint,
      title: "It lives on this device",
      text: "Your passkey is the only key to the wallet. ClipPay can't move your money or sign for you.",
    },
    {
      icon: Landmark,
      title: "Payouts land here",
      text: "Each verified view pays straight into it. Cash out to your bank any time from Dashboard → Wallet.",
    },
    {
      icon: Smartphone,
      title: "Changing phones",
      text: "If your password manager syncs passkeys (iCloud Keychain, Google Password Manager), sign in on the new device with “I have a passkey”. Recovery without the passkey isn't available yet.",
    },
  ];
  return (
    <Dialog open={!!address} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your wallet is ready</DialogTitle>
          <DialogDescription>
            Address <span className="font-mono">{address ? shortAddress(address, 6) : ""}</span>. Three things worth knowing:
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-4">
          {items.map((it) => (
            <li key={it.title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                <it.icon className="size-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-medium">{it.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{it.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" asChild onClick={close}>
            <AppLink href="/dashboard/wallet">Open my wallet</AppLink>
          </Button>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
