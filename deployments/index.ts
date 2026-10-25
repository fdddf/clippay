// Single source of truth for contract IDs and network endpoints. The JSON files
// are written by scripts/deploy.sh (and verifierUrl by scripts/deploy-cloudflare.sh).
import testnet from "./testnet.json" with { type: "json" };

export type Deployment = typeof testnet;

const deployments: Record<string, Deployment> = { testnet };

export function deployment(network = "testnet"): Deployment {
  const d = deployments[network];
  if (!d) throw new Error(`no deployment for network "${network}" in deployments/`);
  return d;
}
