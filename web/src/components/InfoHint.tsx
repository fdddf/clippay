// A small "what's this?" next to a term (passkey, anchor, network fee…):
// opens on click or tap, so it works on phones, and never blocks the flow.
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const HINTS = {
  passkey:
    "A passkey is a login stored on your device and unlocked with Face ID, Touch ID or your screen lock. Here it controls your wallet: no password, no seed phrase.",
  anchor:
    "An anchor is a regulated company on the Stellar network that exchanges tokens for money in a bank account. On testnet this is Stellar's test anchor; nothing real is paid out.",
  networkFee: "Every Stellar transaction pays a small fee to the network. For Face ID wallets, ClipPay pays it for you.",
  costPer1k: "What has been spent (including ClipPay's fee) for each 1,000 verified views so far.",
  receipt: "Each payout is a transaction on Stellar. Its receipt shows who was paid, how much, and when — anyone can check it.",
  testnet: "Stellar's test network works like the real one, but its XLM is free and has no value. Perfect for trying ClipPay.",
} as const;

export function InfoHint({ term, label, className }: { term: keyof typeof HINTS; label: string; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`What is ${label}?`}
        className={cn(
          "inline-flex size-4 translate-y-0.5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" side="top">
        <p className="font-medium capitalize">{label}</p>
        <p className="mt-1 text-muted-foreground">{HINTS[term]}</p>
      </PopoverContent>
    </Popover>
  );
}
