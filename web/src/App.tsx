import { useCallback, useEffect, useRef, useState } from "react";
import { config, explorer, pool, short } from "./stellar.ts";
import { disconnect, restoreWallet, type Wallet } from "./wallet.ts";
import { ConnectModal, WalletPanel } from "./WalletUI.tsx";
import { CampaignList } from "./pages/CampaignList.tsx";
import { CreateCampaign } from "./pages/CreateCampaign.tsx";
import { CampaignDetail } from "./pages/CampaignDetail.tsx";

export interface Notice {
  kind: "ok" | "error";
  text: string;
  hash?: string;
}

export interface PageProps {
  wallet: Wallet | null;
  /** Opens the sign-in dialog; resolves with the wallet, or null if dismissed. */
  connect: () => Promise<Wallet | null>;
  notify: (n: Notice) => void;
  go: (path: string) => void;
}

/** Path-based routes (`/c/3`), so campaign links are clean to share. */
function useRoute() {
  const [path, setPath] = useState(() => {
    // Links shared before the switch from hash routing: `/#/c/3` → `/c/3`.
    if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1));
    return location.pathname;
  });
  const go = useCallback((p: string) => {
    if (p !== location.pathname) history.pushState(null, "", p);
    setPath(p);
    scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const onPop = () => {
      if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1));
      setPath(location.pathname);
    };
    // Same-origin links navigate in-app instead of reloading the page.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href?.startsWith("/") || a.target || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      go(href);
    };
    addEventListener("popstate", onPop);
    addEventListener("hashchange", onPop);
    document.addEventListener("click", onClick);
    return () => {
      removeEventListener("popstate", onPop);
      removeEventListener("hashchange", onPop);
      document.removeEventListener("click", onClick);
    };
  }, [go]);
  return [path, go] as const;
}

export function App() {
  const [path, go] = useRoute();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [modal, setModal] = useState(false);
  const [panel, setPanel] = useState(false);
  const [paused, setPaused] = useState(false);
  const pending = useRef<((w: Wallet | null) => void) | null>(null);

  useEffect(() => {
    restoreWallet().then(setWallet).catch(() => {});
    pool()
      .then((c) => c.paused())
      .then((tx) => setPaused(tx.result))
      .catch(() => {});
  }, []);

  // The wallet menu belongs to the page it was opened on.
  useEffect(() => setPanel(false), [path]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.kind === "error" ? 8000 : 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const connect = useCallback(() => {
    setModal(true);
    return new Promise<Wallet | null>((resolve) => {
      pending.current = resolve;
    });
  }, []);

  const closeModal = (w: Wallet | null) => {
    setModal(false);
    if (w) {
      setWallet(w);
      setNotice({
        kind: "ok",
        text: w.kind === "passkey" ? "Signed in with your passkey wallet" : "Freighter connected",
      });
    }
    pending.current?.(w);
    pending.current = null;
  };

  const props: PageProps = { wallet, connect, notify: setNotice, go };
  const detail = path.match(/^\/c\/(\d+)$/);

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="logo">▶</span> ClipPay
        </a>
        <nav>
          <a href="/" className={path === "/" ? "active" : ""} aria-current={path === "/" ? "page" : undefined}>
            Campaigns
          </a>
          <a href="/new" className={path === "/new" ? "active" : ""} aria-current={path === "/new" ? "page" : undefined}>
            Launch a campaign
          </a>
        </nav>
        {wallet ? (
          <button className="wallet" onClick={() => setPanel((p) => !p)} aria-expanded={panel}
            aria-label={`Wallet ${short(wallet.address)}`}>
            <span className="dot" />
            {wallet.kind === "passkey" && <span aria-label="passkey">🔑</span>}
            {wallet.kind === "watch" && <span aria-label="read-only">👁</span>}
            {short(wallet.address)}
          </button>
        ) : (
          <button className="btn small" onClick={connect}>
            Sign in
          </button>
        )}
        {wallet && panel && (
          <WalletPanel
            wallet={wallet}
            notify={setNotice}
            onClose={() => setPanel(false)}
            onDisconnect={async () => {
              await disconnect(wallet);
              setWallet(null);
              setPanel(false);
            }}
          />
        )}
      </header>

      {paused && (
        <div className="banner" role="alert">
          ClipPay is paused for maintenance. Payouts resume shortly; brands can still refund
          ended campaigns.
        </div>
      )}

      <main className="container">
        {path === "/new" ? (
          <CreateCampaign {...props} />
        ) : detail ? (
          <CampaignDetail key={detail[1]} id={Number(detail[1])} {...props} />
        ) : (
          <CampaignList {...props} />
        )}
      </main>

      <footer className="footer">
        Pay-per-view creator bounties on Stellar testnet ·{" "}
        <a href={explorer.account(config.contractId)} target="_blank" rel="noreferrer">
          contract {short(config.contractId)}
        </a>
      </footer>

      {modal && <ConnectModal onDone={closeModal} onClose={() => closeModal(null)} />}

      {notice && (
        <div className={`toast ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          <span>{notice.text}</span>
          {notice.hash && (
            <a href={explorer.tx(notice.hash)} target="_blank" rel="noreferrer">
              View tx ↗
            </a>
          )}
        </div>
      )}
    </>
  );
}
