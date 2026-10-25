// Network config and CampaignPool / token client helpers.
import { contract } from "@stellar/stellar-sdk";
import { poolClient, type PoolClient } from "@clippay/pool-client";
import { deployment } from "@clippay/deployments";

const env = import.meta.env;
const d = deployment(env.VITE_NETWORK || "testnet");

/** deployments/<network>.json, with optional VITE_* overrides for local dev. */
export const config = {
  rpcUrl: env.VITE_RPC_URL || d.rpcUrl,
  networkPassphrase: env.VITE_NETWORK_PASSPHRASE || d.networkPassphrase,
  contractId: env.VITE_CONTRACT_ID || d.campaignPool.contractId,
  tokenId: env.VITE_TOKEN_ID || d.token.id,
  tokenSymbol: env.VITE_TOKEN_SYMBOL || d.token.symbol,
  /** "/api" means the verifier is served from the same origin as the app (Cloudflare). */
  verifierUrl: new URL(env.VITE_VERIFIER_URL || d.verifierUrl, location.origin).href.replace(/\/$/, ""),
  accountWasmHash: d.smartAccount.wasmHash,
  webauthnVerifier: d.smartAccount.webauthnVerifier,
  anchorDomain: env.VITE_ANCHOR_DOMAIN || d.anchor.domain,
  explorer: d.explorer,
};

/** SEP-24 asset code of the payout token. */
export const anchorAssetCode = config.tokenSymbol === "XLM" ? "native" : config.tokenSymbol;

export const explorer = {
  tx: (hash: string) => `${config.explorer}/tx/${hash}`,
  account: (id: string) => `${config.explorer}/${id.startsWith("C") ? "contract" : "account"}/${id}`,
};

const clients = new Map<string, Promise<PoolClient>>();

/**
 * CampaignPool client. Without options it is read-only (and is also what
 * passkey wallets use: they sign auth entries, not the transaction).
 */
export function pool(signer?: {
  address: string;
  signTransaction: contract.ClientOptions["signTransaction"];
}): Promise<PoolClient> {
  const key = signer?.address ?? "";
  let c = clients.get(key);
  if (!c) {
    c = poolClient({
      contractId: config.contractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
      ...(signer ? { publicKey: signer.address, signTransaction: signer.signTransaction } : {}),
    });
    clients.set(key, c);
  }
  return c;
}

interface Token {
  balance(args: { id: string }): Promise<contract.AssembledTransaction<bigint>>;
}
let token: Promise<contract.Client & Token> | null = null;

export async function tokenBalance(address: string): Promise<bigint> {
  token ??= contract.Client.from({
    contractId: config.tokenId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
  }) as Promise<contract.Client & Token>;
  return (await (await token).balance({ id: address })).result;
}

export function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
