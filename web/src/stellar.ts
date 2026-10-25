// Network config and CampaignPool / token client helpers.
import { contract } from "@stellar/stellar-sdk";
import { poolClient, type PoolClient } from "@clippay/pool-client";

export const config = {
  rpcUrl: import.meta.env.VITE_RPC_URL as string,
  networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE as string,
  contractId: import.meta.env.VITE_CONTRACT_ID as string,
  tokenId: import.meta.env.VITE_TOKEN_ID as string,
  tokenSymbol: (import.meta.env.VITE_TOKEN_SYMBOL as string) || "XLM",
  verifierUrl: (import.meta.env.VITE_VERIFIER_URL as string) || "http://localhost:8787",
  accountWasmHash: import.meta.env.VITE_ACCOUNT_WASM_HASH as string,
  webauthnVerifier: import.meta.env.VITE_WEBAUTHN_VERIFIER as string,
  anchorDomain: (import.meta.env.VITE_ANCHOR_DOMAIN as string) || "testanchor.stellar.org",
};

/** SEP-24 asset code of the payout token. */
export const anchorAssetCode = config.tokenSymbol === "XLM" ? "native" : config.tokenSymbol;

export const explorer = {
  tx: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
  account: (id: string) =>
    `https://stellar.expert/explorer/testnet/${id.startsWith("C") ? "contract" : "account"}/${id}`,
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
