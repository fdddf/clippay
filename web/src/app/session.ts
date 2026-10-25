// A signed-in API session (verifier/src/session.ts) for the connected wallet:
// needed to edit a profile or attach a brief. Kept in localStorage per wallet.
import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { SESSION_KEY, storedSession, type StoredSession } from "@/lib/session";
import { loadWallet, useWallet } from "./wallet";

export function useSession() {
  const { wallet } = useWallet();
  const [session, setSession] = useState<StoredSession | null>(storedSession);
  const current = session && wallet && session.address === wallet.address && session.expires > Date.now() / 1000 ? session : null;

  /** Returns a valid token, asking the wallet to sign a challenge if needed. */
  const token = useCallback(async (): Promise<string> => {
    if (current) return current.token;
    if (!wallet) throw new Error("Sign in with your wallet first");
    const c = await api.challenge(wallet.address);
    const signed = await (await loadWallet()).signChallenge(wallet, c.entry, c.expirationLedger);
    const s = await api.verify(c.id, signed);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {}
    setSession(s);
    return s.token;
  }, [current, wallet]);

  return { session: current, token };
}
