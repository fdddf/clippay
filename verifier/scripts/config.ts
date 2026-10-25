// Config for the e2e scripts: process env first, then deployments/<network>.json.
import { deployment } from "@clippay/deployments";

const d = deployment(process.env.NETWORK || "testnet");
const defaults: Record<string, string> = {
  RPC_URL: d.rpcUrl,
  NETWORK_PASSPHRASE: d.networkPassphrase,
  CONTRACT_ID: d.campaignPool.contractId,
  TOKEN_ID: d.token.id,
  ACCOUNT_WASM_HASH: d.smartAccount.wasmHash,
  WEBAUTHN_VERIFIER: d.smartAccount.webauthnVerifier,
  SMART_ACCOUNT_DEPLOYER: d.smartAccount.deployer,
};

export const env = (k: string): string => {
  const v = process.env[k] || defaults[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
