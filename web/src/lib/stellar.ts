// CampaignPool / token client helpers (loads the Stellar SDK).
import { contract } from "@stellar/stellar-sdk";
import { poolClient, type PoolClient } from "@clippay/pool-client";

export { anchorAssetCode, config, explorer } from "./network.ts";
import { config } from "./network.ts";

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
