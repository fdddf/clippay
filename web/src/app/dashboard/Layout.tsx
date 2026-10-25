// /dashboard: one place for everything an account does (docs/ux-plan.md §5.6).
// Tabs appear only when the account has something to show in them. Sidebar
// on wide screens, a tab bar on phones.
import { NavLink, Outlet, useOutletContext } from "react-router";
import { Clapperboard, Coins, LayoutDashboard, LogOut, Megaphone, Settings, Wallet as WalletIcon, Wallet2 } from "lucide-react";
import { Amount } from "@/components/Amount";
import { Identicon } from "@/components/Identicon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Account } from "@/lib/api-types";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAccount, useBalance } from "../queries";
import { useWallet, type Wallet } from "../wallet";

export interface DashboardContext {
  wallet: Wallet;
  account: Account;
  balance: bigint | undefined;
}

export const useDashboard = () => useOutletContext<DashboardContext>();

function tabsFor(a: Account) {
  return [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true, show: true },
    { to: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone, show: a.campaigns.length > 0 },
    { to: "/dashboard/submissions", label: "Submissions", icon: Clapperboard, show: a.submissions.length > 0 },
    { to: "/dashboard/earnings", label: "Earnings", icon: Coins, show: a.submissions.length > 0 },
    { to: "/dashboard/wallet", label: "Wallet", icon: WalletIcon, show: true },
    { to: "/dashboard/settings", label: "Settings", icon: Settings, show: true },
  ].filter((t) => t.show);
}

function SignInPrompt() {
  const { connect } = useWallet();
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Wallet2 className="size-5" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Sign in to see your dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Your campaigns, posts, earnings and wallet in one place. Sign in with a passkey or Freighter — no email needed.
      </p>
      <Button size="lg" className="mt-6" onClick={() => void connect()}>
        Sign in
      </Button>
    </div>
  );
}

function Loading() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 md:grid-cols-[14rem_minmax(0,1fr)]" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="hidden h-80 rounded-xl md:block" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    isActive ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
  );

export function DashboardLayout() {
  const { wallet, restoring, disconnect } = useWallet();
  const account = useAccount(wallet?.address);
  const balance = useBalance(wallet?.address);
  if (restoring) return <Loading />;
  if (!wallet) return <SignInPrompt />;
  if (!account.data) return <Loading />;
  const a = account.data;
  const tabs = tabsFor(a);
  const name = a.profile?.name ?? null;
  const ctx: DashboardContext = { wallet, account: a, balance: balance.data };

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pt-6 pb-24 sm:px-6 md:grid-cols-[14rem_minmax(0,1fr)] md:pt-8 md:pb-12">
      <aside className="hidden md:block">
        <div className="sticky top-24 space-y-6">
          <div className="flex items-center gap-3 px-1">
            <Identicon seed={wallet.address} name={name} src={a.profile?.avatar} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-medium">{name ?? shortAddress(wallet.address)}</p>
              <p className="text-sm text-muted-foreground">
                {balance.data !== undefined ? <Amount units={balance.data} /> : "—"}
              </p>
            </div>
          </div>
          <nav aria-label="Dashboard" className="space-y-1">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={linkClass}>
                <t.icon className="size-4" aria-hidden="true" />
                {t.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <Outlet context={ctx} />
      </div>
      <nav
        aria-label="Dashboard"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive ? "font-medium text-primary" : "text-muted-foreground")
            }
          >
            <t.icon className="size-5" aria-hidden="true" />
            <span className="max-w-full truncate px-0.5">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Page title row for a dashboard tab. */
export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
