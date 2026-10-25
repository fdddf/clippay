// The connected wallet, for the whole app. The wallet libraries (Stellar SDK,
// smart-account-kit, Freighter) load only when someone signs in or a page
// needs to send a transaction, so browsing stays light.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SESSION_KEY } from "@/lib/session";
import type { Wallet } from "@/lib/wallet";
import { SignInDialog } from "./SignInDialog";

export type { Wallet };

export const loadWallet = () => import("@/lib/wallet");

const LAST_KIND = "clippay.wallet";
const hadWallet = () => {
  try {
    return localStorage.getItem(LAST_KIND) !== null || new URLSearchParams(location.search).has("as");
  } catch {
    return false;
  }
};

interface WalletContext {
  wallet: Wallet | null;
  /** True while reconnecting to the wallet used last time. */
  restoring: boolean;
  /** Opens the sign-in dialog; resolves with the wallet, or null if dismissed. */
  connect(): Promise<Wallet | null>;
  disconnect(): Promise<void>;
}

const Ctx = createContext<WalletContext | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [restoring, setRestoring] = useState(hadWallet);
  const [open, setOpen] = useState(false);
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

  const connect = useCallback(() => {
    void loadWallet(); // start fetching while the dialog opens
    setOpen(true);
    return new Promise<Wallet | null>((resolve) => {
      pending.current = resolve;
    });
  }, []);

  const finish = useCallback((w: Wallet | null) => {
    if (w) setWallet(w);
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
      <SignInDialog open={open} onDone={finish} />
    </Ctx.Provider>
  );
}

export function useWallet(): WalletContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}
