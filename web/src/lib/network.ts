// Network config from deployments/<network>.json, with optional VITE_*
// overrides for local dev. No Stellar SDK here: the landing page imports it.
import { deployment } from "@clippay/deployments";

const env = import.meta.env;
const d = deployment(env.VITE_NETWORK || "testnet");
const origin = typeof location === "undefined" ? "http://localhost" : location.origin;

export const config = {
  network: d.network,
  rpcUrl: env.VITE_RPC_URL || d.rpcUrl,
  networkPassphrase: env.VITE_NETWORK_PASSPHRASE || d.networkPassphrase,
  contractId: env.VITE_CONTRACT_ID || d.campaignPool.contractId,
  wasmHash: d.campaignPool.wasmHash,
  tokenId: env.VITE_TOKEN_ID || d.token.id,
  tokenSymbol: env.VITE_TOKEN_SYMBOL || d.token.symbol,
  tokenDecimals: d.token.decimals,
  feeBps: d.campaignPool.feeBps,
  /** Seconds after a deadline during which views are still paid. */
  settleGrace: d.campaignPool.settleGrace,
  /** "/api" means the verifier is served from the same origin as the app (Cloudflare). */
  verifierUrl: new URL(env.VITE_VERIFIER_URL || d.verifierUrl, origin).href.replace(/\/$/, ""),
  accountWasmHash: d.smartAccount.wasmHash,
  webauthnVerifier: d.smartAccount.webauthnVerifier,
  anchorDomain: env.VITE_ANCHOR_DOMAIN || d.anchor.domain,
  explorer: d.explorer,
  siteUrl: d.siteUrl,
  repoUrl: d.repoUrl,
};

/** SEP-24 asset code of the payout token. */
export const anchorAssetCode = config.tokenSymbol === "XLM" ? "native" : config.tokenSymbol;

export const explorer = {
  tx: (hash: string) => `${config.explorer}/tx/${hash}`,
  account: (id: string) => `${config.explorer}/${id.startsWith("C") ? "contract" : "account"}/${id}`,
};
