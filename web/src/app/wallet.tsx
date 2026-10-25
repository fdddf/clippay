// The connected wallet, for the whole app. The wallet libraries (Stellar SDK,
// smart-account-kit, Freighter) load only when someone signs in or a page
// needs to send a transaction, so browsing stays light.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SESSION_KEY } from "@/lib/session";
import type { Wallet } from "@/lib/wallet";
import { SignInDialog, type Role } from "./SignInDialog";
import { WelcomeDialog, shouldWelcome } from "./WelcomeDialog";

export type { Wallet, Role };

export const loadWallet = () => import("@/lib/wallet");

const LAST_KIND = "clippay.wallet";
const hadWallet = () => {
  try {
    // `?as=` previews an account in dev only (see restoreWallet).
    return localStorage.getItem(LAST_KIND) !== null || (import.meta.env.DEV && new URLSearchParams(location.search).has("as"));
  } catch {
    return false;
  }
};

interface WalletContext {
  wallet: Wallet | null;
  /** True while reconnecting to the wallet used last time. */
  restoring: boolean;
  /**
   * Opens the sign-in dialog (on the creator or brand path, if known);
   * resolves with the wallet, or null if dismissed.
   */
  connect(role?: Role): Promise<Wallet | null>;
  disconnect(): Promise<void>;
}

const Ctx = createContext<WalletContext | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [restoring, setRestoring] = useState(hadWallet);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [welcome, setWelcome] = useState<string | null>(null);
  const pending = useRef<((w: Wallet | null) => void) | null>(null);

  useEffect(() => {
    if (!restoring) return;
    loadWallet()
      .then((m) => m.restoreWallet())
      .then(setWallet)
      .catch(() => {})
      .finally(() => setRestoring(false));
    // Runs once: `restoring` only starts true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback((r?: Role) => {
    void loadWallet(); // start fetching while the dialog opens
    setRole(r ?? null);
    setOpen(true);
    return new Promise<Wallet | null>((resolve) => {
      pending.current = resolve;
    });
  }, []);

  const finish = useCallback((w: Wallet | null, created?: boolean) => {
    if (w) setWallet(w);
    if (w && created && shouldWelcome(w.address)) setWelcome(w.address);
    setOpen(false);
    pending.current?.(w);
    pending.current = null;
  }, []);

  const disconnect = useCallback(async () => {
    if (wallet) await (await loadWallet()).disconnect(wallet);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
    setWallet(null);
  }, [wallet]);

  const value = useMemo(() => ({ wallet, restoring, connect, disconnect }), [wallet, restoring, connect, disconnect]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <SignInDialog open={open} initialRole={role} onDone={finish} />
      <WelcomeDialog address={welcome} onClose={() => setWelcome(null)} />
    </Ctx.Provider>
  );
}

export function useWallet(): WalletContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}
