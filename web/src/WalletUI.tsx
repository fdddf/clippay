import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeError, fromUnits } from "@clippay/pool-client";
import { getTransaction, loadAnchor, startWithdraw, type Anchor, type Sep24Transaction } from "@clippay/anchor";
import { anchorAssetCode, config, explorer, short, tokenBalance } from "./stellar.ts";
import {
  anchorLogin,
  connectFreighter,
  connectPasskey,
  createPasskeyWallet,
  payAnchor,
  withdraw,
  type Wallet,
} from "./wallet.ts";
import type { Notice } from "./App.tsx";
import { useDialog } from "./dialog.ts";

export function ConnectModal({
  onDone,
  onClose,
}: {
  onDone: (w: Wallet) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useDialog<HTMLDivElement>(() => !busy && onClose());

  async function run(label: string, fn: () => Promise<Wallet>) {
    setBusy(label);
    setError(null);
    try {
      onDone(await fn());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    run("create", () => createPasskeyWallet(name.trim()));
  };

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="signin-title"
        ref={dialog} onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} disabled={!!busy} aria-label="Close">
          ×
        </button>
        <h2 id="signin-title">Sign in to ClipPay</h2>

        <section>
          <div className="eyebrow">Creators</div>
          <p className="muted small">
            A wallet secured by Face ID / Touch ID. No seed phrase, no XLM needed for fees —
            payouts land here directly.
          </p>
          <form className="form" onSubmit={onCreate}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
              aria-label="Creator name"
              placeholder="Your creator name (optional)" disabled={!!busy} />
            <button className="btn" disabled={!!busy}>
              {busy === "create" ? "Creating your wallet…" : "Create passkey wallet"}
            </button>
          </form>
          <button className="link" disabled={!!busy} onClick={() => run("passkey", connectPasskey)}>
            {busy === "passkey" ? "Waiting for your passkey…" : "I already have one — sign in with passkey"}
          </button>
        </section>

        <div className="divider">
          <span>or</span>
        </div>

        <section>
          <div className="eyebrow">Brands</div>
          <button className="btn ghost wide" disabled={!!busy} onClick={() => run("freighter", connectFreighter)}>
            {busy === "freighter" ? "Check Freighter…" : "Connect Freighter"}
          </button>
        </section>

        {error && <p className="error small" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export function WalletPanel({
  wallet,
  notify,
  onDisconnect,
  onClose,
}: {
  wallet: Wallet;
  notify: (n: Notice) => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"bank" | "address">("bank");
  const sym = config.tokenSymbol;
  const dialog = useDialog<HTMLDivElement>(onClose);

  const refresh = () => tokenBalance(wallet.address).then(setBalance).catch(() => setBalance(null));
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [wallet.address]);

  async function onWithdraw(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const hash = await withdraw(wallet, to.trim(), Number(amount));
      notify({ kind: "ok", text: `Sent ${amount} ${sym}`, hash });
      setAmount("");
      refresh();
    } catch (err) {
      notify({ kind: "error", text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="panel card" role="dialog" aria-label="Wallet" ref={dialog}>
        <div className="panel-head">
          <span className="pill">
            {wallet.kind === "passkey" ? "Passkey wallet" : wallet.kind === "watch" ? "Read-only preview" : "Freighter"}
          </span>
          <a href={explorer.account(wallet.address)} target="_blank" rel="noreferrer" className="mono small">
            {short(wallet.address)} ↗
          </a>
        </div>
        <div className="muted small">Balance</div>
        <div className="stat-value">
          {balance === null ? "—" : fromUnits(balance)} {sym}
        </div>

        {wallet.kind === "passkey" && (
          <div className="segmented" role="tablist" aria-label="Withdraw to">
            <button role="tab" aria-selected={mode === "bank"} onClick={() => setMode("bank")}>
              To bank
            </button>
            <button role="tab" aria-selected={mode === "address"} onClick={() => setMode("address")}>
              To address
            </button>
          </div>
        )}

        {wallet.kind === "passkey" && mode === "bank" && (
          <CashOut wallet={wallet} notify={notify} onPaid={refresh} />
        )}

        {wallet.kind === "passkey" && mode === "address" && (
          <form className="form" onSubmit={onWithdraw}>
            <div className="muted small">Send to any Stellar address, e.g. an exchange.</div>
            <input required value={to} onChange={(e) => setTo(e.target.value)} aria-label="Destination address"
              placeholder="Destination G… or C… address" pattern="[GC][A-Z2-7]{55}" />
            <div className="row">
              <input required type="number" min="0.0000001" step="any" value={amount} aria-label={`Amount (${sym})`}
                onChange={(e) => setAmount(e.target.value)} placeholder={`Amount (${sym})`} />
              <button className="btn" disabled={busy}>
                {busy ? "Signing…" : "Withdraw"}
              </button>
            </div>
          </form>
        )}

        <button className="link danger" onClick={onDisconnect}>
          Sign out
        </button>
      </div>
    </>
  );
}

type Step =
  | { name: "idle" }
  | { name: "auth" }
  | { name: "form"; url: string; opened: boolean }
  | { name: "confirm"; tx: Sep24Transaction }
  | { name: "paying"; tx: Sep24Transaction; hash?: string }
  | { name: "done"; tx: Sep24Transaction; hash: string };

const fiat = (asset?: string) => asset?.replace(/^iso4217:/, "") ?? "";

/**
 * SEP-24 cash-out: authenticate the passkey wallet with the anchor (SEP-45),
 * collect bank details in the anchor's own window, then pay the anchor.
 */
function CashOut({ wallet, notify, onPaid }: { wallet: Wallet; notify: (n: Notice) => void; onPaid: () => void }) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>({ name: "idle" });
  const session = useRef<{ anchor: Anchor; jwt: string; id: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sym = config.tokenSymbol;

  const stopPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopPolling, []);

  const fail = (e: unknown) => {
    stopPolling();
    setStep({ name: "idle" });
    notify({ kind: "error", text: describeError(e) });
  };

  /** Poll the anchor until `until` matches the transaction's status. */
  const poll = (until: (tx: Sep24Transaction) => boolean, then: (tx: Sep24Transaction) => void) => {
    stopPolling();
    timer.current = setInterval(async () => {
      const s = session.current;
      if (!s) return;
      try {
        const tx = await getTransaction(s.anchor, s.jwt, s.id);
        if (["error", "expired", "refunded", "no_market"].includes(tx.status)) {
          throw new Error(tx.message || `Withdrawal ${tx.status}`);
        }
        if (until(tx)) {
          stopPolling();
          then(tx);
        }
      } catch (e) {
        fail(e);
      }
    }, 4000);
  };

  async function onStart(e: FormEvent) {
    e.preventDefault();
    // Open the window inside the click so popup blockers allow it.
    const popup = window.open("about:blank", "clippay-anchor", "width=480,height=760");
    setStep({ name: "auth" });
    try {
      const anchor = await loadAnchor(config.anchorDomain);
      const jwt = await anchorLogin(wallet, anchor);
      const started = await startWithdraw(anchor, jwt, {
        assetCode: anchorAssetCode,
        account: wallet.address,
        amount,
      });
      session.current = { anchor, jwt, id: started.id };
      if (popup) popup.location.href = started.url;
      setStep({ name: "form", url: started.url, opened: !!popup && !popup.closed });
      poll(
        (tx) => tx.status === "pending_user_transfer_start",
        (tx) => setStep({ name: "confirm", tx }),
      );
    } catch (err) {
      popup?.close();
      fail(err);
    }
  }

  async function onConfirm(tx: Sep24Transaction) {
    setStep({ name: "paying", tx });
    try {
      const hash = await payAnchor(wallet, tx);
      onPaid();
      setStep({ name: "paying", tx, hash });
      poll(
        (t) => t.status === "completed" || t.status === "pending_external",
        (t) => {
          setStep({ name: "done", tx: t, hash });
          notify({ kind: "ok", text: `${t.amount_out ?? ""} ${fiat(t.amount_out_asset)} is on its way to your bank`, hash });
        },
      );
    } catch (err) {
      fail(err);
    }
  }

  switch (step.name) {
    case "idle":
      return (
        <form className="form" onSubmit={onStart}>
          <div className="muted small">
            Withdraw through <b>{config.anchorDomain}</b>, a Stellar anchor that pays out to your bank
            account. You'll enter your bank details on the anchor's page.
          </div>
          <div className="row">
            <input required type="number" min="0.0000001" step="any" value={amount} aria-label={`Amount (${sym})`}
              onChange={(e) => setAmount(e.target.value)} placeholder={`Amount (${sym})`} />
            <button className="btn">Cash out</button>
          </div>
        </form>
      );
    case "auth":
      return <p className="progress">Confirm with your passkey to sign in to the anchor…</p>;
    case "form":
      return (
        <div className="form">
          <p className="progress">
            {step.opened
              ? "Enter your bank details in the anchor's window, then come back here."
              : "Your browser blocked the anchor's window. Open it to enter your bank details, then come back here."}
          </p>
          <a className={`btn ${step.opened ? "ghost" : ""} wide`} href={step.url} target="clippay-anchor" rel="noreferrer">
            {step.opened ? "Reopen the anchor's form ↗" : "Open the anchor's form ↗"}
          </a>
        </div>
      );
    case "confirm":
      return (
        <div className="form">
          <p className="small">
            Send <b>{step.tx.amount_in} {sym}</b> to the anchor — you'll receive{" "}
            <b>{step.tx.amount_out} {fiat(step.tx.amount_out_asset)}</b>
            {step.tx.fee_details ? ` after a ${step.tx.fee_details.total} ${sym} fee` : ""}.
          </p>
          <button className="btn" onClick={() => onConfirm(step.tx)}>Confirm with passkey</button>
        </div>
      );
    case "paying":
      return (
        <p className="progress">
          {step.hash ? (
            <>Sent. Waiting for the anchor to pay out… <a href={explorer.tx(step.hash)} target="_blank" rel="noreferrer">tx ↗</a></>
          ) : (
            "Confirm the transfer with your passkey…"
          )}
        </p>
      );
    case "done":
      return (
        <div className="form">
          <p className="small">
            ✓ <b>{step.tx.amount_out} {fiat(step.tx.amount_out_asset)}</b> is on its way to your bank.{" "}
            <a href={explorer.tx(step.hash)} target="_blank" rel="noreferrer">tx ↗</a>
          </p>
          <button className="link" onClick={() => setStep({ name: "idle" })}>Cash out again</button>
        </div>
      );
  }
}
