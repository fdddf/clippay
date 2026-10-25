// Two ways in: creators get a passkey smart wallet (OpenZeppelin smart account via
// smart-account-kit — no seed phrase, fees paid by the verifier's /relay), brands
// can use Freighter.
import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { contract } from "@stellar/stellar-sdk";
import { IndexedDBStorage, SmartAccountKit } from "smart-account-kit";
import type { PoolClient } from "@clippay/pool-client";
import { authenticate, buildWithdrawalPayment, type Anchor, type Sep24Transaction } from "@clippay/anchor";
import { config, pool } from "./stellar.ts";

/** `watch` is a dev-only, read-only view of an address (see restoreWallet). */
export type WalletKind = "passkey" | "freighter" | "watch";

export interface Wallet {
  kind: WalletKind;
  address: string;
}

const LAST_KIND = "clippay.wallet";
const remember = (kind: WalletKind | null) => {
  try {
    if (kind) localStorage.setItem(LAST_KIND, kind);
    else localStorage.removeItem(LAST_KIND);
  } catch {}
};
const lastKind = (): WalletKind | null => {
  try {
    return localStorage.getItem(LAST_KIND) as WalletKind | null;
  } catch {
    return null;
  }
};

let kitInstance: SmartAccountKit | null = null;
function kit(): SmartAccountKit {
  kitInstance ??= new SmartAccountKit({
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    accountWasmHash: config.accountWasmHash,
    webauthnVerifierAddress: config.webauthnVerifier,
    relayerUrl: `${config.verifierUrl}/relay`,
    storage: new IndexedDBStorage(),
    rpName: "ClipPay",
  });
  return kitInstance;
}

/** Reconnect silently to whichever wallet was used last. */
export async function restoreWallet(): Promise<Wallet | null> {
  // Dev only: `?as=G…` previews the UI as that address without being able to sign.
  if (import.meta.env.DEV) {
    const as = new URLSearchParams(location.search).get("as");
    if (as && /^[GC][A-Z2-7]{55}$/.test(as)) return { kind: "watch", address: as };
  }
  const kind = lastKind();
  if (kind === "passkey") {
    const r = await kit().connectWallet().catch(() => null);
    if (r) return { kind, address: r.contractId };
  }
  if (kind === "freighter") {
    const { isConnected: installed } = await isConnected();
    if (installed) {
      const { address } = await getAddress();
      if (address) return { kind, address };
    }
  }
  return null;
}

export async function createPasskeyWallet(name: string): Promise<Wallet> {
  const r = await kit().createWallet("ClipPay", name || "creator", { autoSubmit: true });
  if (r.submitResult && !r.submitResult.success) throw r.submitResult.error;
  remember("passkey");
  return { kind: "passkey", address: r.contractId };
}

export async function connectPasskey(): Promise<Wallet> {
  const r = await kit().connectWallet({ fresh: true });
  if (!r) throw new Error("No passkey wallet found on this device");
  remember("passkey");
  return { kind: "passkey", address: r.contractId };
}

export async function connectFreighter(): Promise<Wallet> {
  const { isConnected: installed } = await isConnected();
  if (!installed) throw new Error("Install the Freighter extension to continue");
  const { address, error } = await requestAccess();
  if (error) throw new Error(error.message);
  const net = await getNetworkDetails();
  if (net.networkPassphrase !== config.networkPassphrase) {
    throw new Error("Switch Freighter to Testnet");
  }
  remember("freighter");
  return { kind: "freighter", address };
}

export async function disconnect(w: Wallet) {
  if (w.kind === "passkey") await kit().disconnect();
  remember(null);
}

const freighterSigner: contract.ClientOptions["signTransaction"] = async (xdr, opts) => {
  const res = await signTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
    address: opts?.address,
  });
  if (res.error) throw new Error(res.error.message);
  return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
};

/**
 * Build a CampaignPool call and submit it as `w`.
 * Freighter signs and pays itself; a passkey signs only its auth entry and the
 * relay pays the fee. Passkey submissions don't return the contract's result.
 */
export async function sendAs<T>(
  w: Wallet,
  build: (client: PoolClient) => Promise<contract.AssembledTransaction<T>>,
): Promise<{ hash: string; result?: T }> {
  if (w.kind === "watch") throw new Error("Read-only preview — sign in to make changes");
  if (w.kind === "freighter") {
    const tx = await build(await pool({ address: w.address, signTransaction: freighterSigner }));
    const sent = await tx.signAndSend();
    return { hash: sent.sendTransactionResponse?.hash ?? "", result: sent.result };
  }
  const tx = await build(await pool());
  const res = await kit().signAndSubmit(tx);
  if (!res.success) throw res.error;
  return { hash: res.hash };
}

/** Move funds out of a passkey wallet (e.g. to an exchange or an anchor). */
export async function withdraw(w: Wallet, to: string, amount: number) {
  if (w.kind !== "passkey") throw new Error("Use your wallet app to move Freighter funds");
  const res = await kit().transfer(config.tokenId, to, amount);
  if (!res.success) throw res.error;
  return res.hash;
}

/** SEP-45: prove control of the passkey wallet to an anchor; returns its JWT. */
export function anchorLogin(w: Wallet, anchor: Anchor): Promise<string> {
  if (w.kind !== "passkey") throw new Error("Bank cash-out is available for passkey wallets");
  // Rule 0 is the default context rule holding the wallet's passkey.
  return authenticate(anchor, w.address, (entry) => kit().signAuthEntry(entry, { contextRuleIds: [0] }));
}

/** Send a SEP-24 withdrawal's funds to the anchor (fee sponsored). */
export async function payAnchor(w: Wallet, tx: Sep24Transaction): Promise<string> {
  const payment = await buildWithdrawalPayment({
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    tokenId: config.tokenId,
    from: w.address,
    tx,
  });
  const res = await kit().signAndSubmit(payment);
  if (!res.success) throw res.error;
  return res.hash;
}
