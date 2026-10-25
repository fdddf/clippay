// Header and footer of the prerendered marketing pages. Static markup only:
// the mobile menu is a <details>, and client.ts swaps "Sign in" for
// "Dashboard" when a session exists.
import type { ReactNode } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import { Logo } from "@/components/Logo";
import { TestnetBadge } from "@/components/StatusPill";
import { buttonVariants } from "@/components/ui/button";
import { shortAddress } from "@/lib/format";
import { config, explorer } from "@/lib/network";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/#brands", label: "For brands" },
  { href: "/#creators", label: "For creators" },
  { href: "/how-it-works", label: "How it works" },
];

/** A max-width page column with the site's side gutters. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

function Testnet() {
  return (
    <a
      href="/security#testnet"
      title="This is Stellar's test network: balances have no real value"
      className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <TestnetBadge />
    </a>
  );
}

export function MarketingHeader({ path }: { path: string }) {
  const signIn = (
    <a href="/dashboard" data-auth-cta className={buttonVariants({ size: "sm" })}>
      Sign in
    </a>
  );
  return (
    // No backdrop blur below md: it would make the header the containing block
    // of the fixed mobile menu.
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background md:bg-background/80 md:backdrop-blur-md">
      <Container className="flex h-16 items-center gap-6">
        <a href="/" aria-label="ClipPay home" className="rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <Logo />
        </a>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              aria-current={n.href === path ? "page" : undefined}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Testnet />
          <div className="hidden md:block">{signIn}</div>
          <details className="group md:hidden [&_summary::-webkit-details-marker]:hidden">
            <summary
              aria-label="Menu"
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "cursor-pointer list-none")}
            >
              <Menu className="group-open:hidden" aria-hidden="true" />
              <X className="hidden group-open:block" aria-hidden="true" />
            </summary>
            <div className="fixed inset-x-0 top-16 bottom-0 z-50 overflow-y-auto border-t bg-background px-4 pt-4 pb-8">
              <nav aria-label="Mobile" className="flex flex-col">
                {NAV.map((n) => (
                  <a key={n.href} href={n.href} className="border-b py-4 text-lg font-medium">
                    {n.label}
                  </a>
                ))}
              </nav>
              <div className="mt-6 grid grid-cols-1 gap-3">
                <a href="/dashboard" data-auth-cta className={buttonVariants({ size: "lg" })}>
                  Sign in
                </a>
                <a href="/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Launch a campaign
                </a>
              </div>
            </div>
          </details>
        </div>
      </Container>
    </header>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
        {external && <ArrowUpRight className="size-3" aria-hidden="true" />}
      </a>
    </li>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">{children}</ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <Container className="grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm text-muted-foreground">
            Pay-per-view creator campaigns. Budgets are held by a Stellar smart contract and paid out as views
            are verified.
          </p>
        </div>
        <FooterColumn title="Product">
          <FooterLink href="/campaigns">Campaigns</FooterLink>
          <FooterLink href="/new">Launch a campaign</FooterLink>
          <FooterLink href="/dashboard">Dashboard</FooterLink>
        </FooterColumn>
        <FooterColumn title="Resources">
          <FooterLink href="/how-it-works">How it works</FooterLink>
          <FooterLink href="/security">Security</FooterLink>
          <FooterLink href={config.repoUrl}>GitHub</FooterLink>
        </FooterColumn>
        <FooterColumn title="Legal">
          <FooterLink href="/terms">Terms</FooterLink>
          <FooterLink href="/privacy">Privacy</FooterLink>
        </FooterColumn>
        <FooterColumn title="Network">
          <li className="flex items-center gap-2 text-muted-foreground">
            <span data-health className="relative flex size-2">
              <span className="size-2 rounded-full bg-muted-foreground/40" />
            </span>
            <span data-health-label>Stellar testnet</span>
          </li>
          <FooterLink href={explorer.account(config.contractId)}>
            <span className="font-mono text-xs">Contract {shortAddress(config.contractId, 5)}</span>
          </FooterLink>
          <FooterLink href={config.repoUrl}>
            <GithubMark className="size-3.5" />
            Source code
          </FooterLink>
        </FooterColumn>
      </Container>
      <Container className="flex flex-col gap-2 border-t py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 ClipPay. A testnet preview — balances have no real value.</p>
        <p className="flex items-center gap-2">
          Running on <Testnet />
        </p>
      </Container>
    </footer>
  );
}

/** A marketing page: header, content, footer. */
export function MarketingPage({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-[3px] focus:ring-ring/50"
      >
        Skip to content
      </a>
      <MarketingHeader path={path} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
