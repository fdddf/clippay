// The app's header: navigation, the testnet badge, and the account menu.
import { useState } from "react";
import { Check, Copy, ExternalLink, LayoutDashboard, LogOut, Menu, Megaphone, Wallet as WalletIcon } from "lucide-react";
import { Identicon } from "@/components/Identicon";
import { Logo } from "@/components/Logo";
import { TestnetBadge } from "@/components/StatusPill";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { shortAddress } from "@/lib/format";
import { explorer } from "@/lib/network";
import { cn } from "@/lib/utils";
import { AppLink, AppNavLink } from "./AppLink";
import { useAccount } from "./queries";
import { useWallet } from "./wallet";

const NAV = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/#brands", label: "For brands" },
  { href: "/how-it-works", label: "How it works" },
];

function AccountMenu() {
  const { wallet, disconnect } = useWallet();
  const { data } = useAccount(wallet?.address);
  const [copied, setCopied] = useState(false);
  if (!wallet) return null;
  const name = data?.profile?.name ?? null;
  const copy = async () => {
    await navigator.clipboard.writeText(wallet.address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-1 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`Account ${name ?? shortAddress(wallet.address)}`}
      >
        <Identicon seed={wallet.address} name={name} src={data?.profile?.avatar} size="sm" />
        <span className="max-w-32 truncate">{name ?? shortAddress(wallet.address)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs text-muted-foreground">
            {wallet.kind === "passkey" ? "Passkey wallet" : wallet.kind === "freighter" ? "Freighter" : "Read-only preview"}
          </p>
          <p className="mt-0.5 font-mono text-xs">{shortAddress(wallet.address, 6)}</p>
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={(e) => (e.preventDefault(), void copy())}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy address"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={explorer.account(wallet.address)} target="_blank" rel="noreferrer">
            <ExternalLink />
            View on Stellar Expert
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <AppLink href="/dashboard">
            <LayoutDashboard />
            Dashboard
          </AppLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <AppLink href="/dashboard/wallet">
            <WalletIcon />
            Wallet & cash out
          </AppLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void disconnect()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountArea() {
  const { wallet, restoring, connect } = useWallet();
  if (restoring) return <Skeleton className="h-8 w-28 rounded-full" />;
  if (wallet) return <AccountMenu />;
  return (
    <Button size="sm" onClick={() => void connect()}>
      Sign in
    </Button>
  );
}

const navClass =
  "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground";

export function AppHeader() {
  const { wallet, connect } = useWallet();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background md:bg-background/80 md:backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="/" aria-label="ClipPay home" className="rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <Logo />
        </a>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <AppNavLink key={n.href} href={n.href} className={navClass}>
              {n.label}
            </AppNavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a
            href="/security#testnet"
            title="This is Stellar's test network: balances have no real value"
            className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <TestnetBadge />
          </a>
          <AppLink href="/new" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden lg:inline-flex")}>
            <Megaphone aria-hidden="true" />
            Launch a campaign
          </AppLink>
          <div className="hidden md:block">
            <AccountArea />
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-xs">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col px-4" onClick={() => setOpen(false)}>
                {NAV.map((n) => (
                  <AppNavLink key={n.href} href={n.href} className="border-b py-3 text-base font-medium">
                    {n.label}
                  </AppNavLink>
                ))}
                <AppLink href="/new" className="border-b py-3 text-base font-medium">
                  Launch a campaign
                </AppLink>
                {wallet && (
                  <AppLink href="/dashboard" className="border-b py-3 text-base font-medium">
                    Dashboard
                  </AppLink>
                )}
              </nav>
              <div className="mt-4 px-4">
                {wallet ? (
                  <AccountMenu />
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      void connect();
                    }}
                  >
                    Sign in
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
