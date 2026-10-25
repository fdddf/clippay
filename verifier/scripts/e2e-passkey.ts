// End-to-end check of the passkey creator flow without a browser:
//   software passkey → smart wallet deployed via /relay → submit() signed by the
//   passkey and fee-sponsored via /relay → verifier settles → wallet balance.
//
// Needs the verifier running (pnpm dev) and an open campaign:
//   pnpm e2e:passkey [campaignId]
import { contract } from "@stellar/stellar-sdk";
import { poolClient, unwrap, fromUnits } from "@clippay/pool-client";
import { scriptKit } from "./soft-passkey.ts";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

const verifierUrl = `http://localhost:${process.env.PORT ?? 8787}`;
const campaignId = Number(process.argv[2] ?? 0);

const kit = scriptKit(env, verifierUrl);

const step = (s: string) => console.log(`\n▸ ${s}`);

step("create passkey wallet (deployment sponsored by /relay)");
const created = await kit.createWallet("ClipPay", "e2e-creator", { autoSubmit: true });
if (created.submitResult && !created.submitResult.success) {
  throw new Error(`deploy failed: ${created.submitResult.error.message}`);
}
const wallet = created.contractId;
console.log(`  wallet ${wallet}  tx ${created.submitResult?.hash}`);

step(`submit to campaign #${campaignId} (signed with the passkey, fee sponsored)`);
const pool = await poolClient({
  contractId: env("CONTRACT_ID"),
  rpcUrl: env("RPC_URL"),
  networkPassphrase: env("NETWORK_PASSPHRASE"),
});
const tx = await pool.submit({
  id: campaignId,
  creator: wallet,
  url: `https://youtu.be/e2e-${Date.now()}`,
});
const submitted = await kit.signAndSubmit(tx);
if (!submitted.success) throw new Error(`submit failed: ${submitted.error.message}`);
console.log(`  tx ${submitted.hash}`);

step("wait for some mock views, then ask the verifier to settle");
await new Promise((r) => setTimeout(r, 8000));
const res = await fetch(`${verifierUrl}/settle/${campaignId}`, { method: "POST" });
const body = (await res.json()) as { results?: { creator: string; paid?: string; error?: string }[] };
console.log(" ", body.results?.find((r) => r.creator === wallet));

step("wallet balance");
const sub = unwrap((await pool.get_submission({ id: campaignId, creator: wallet })).result);
const token = await contract.Client.from({
  contractId: env("TOKEN_ID"),
  rpcUrl: env("RPC_URL"),
  networkPassphrase: env("NETWORK_PASSPHRASE"),
});
const bal = (await (token as unknown as {
  balance(a: { id: string }): Promise<contract.AssembledTransaction<bigint>>;
}).balance({ id: wallet })).result;
console.log(`  views ${sub.views} · paid ${fromUnits(sub.paid)} · balance ${fromUnits(bal)}`);
console.log("\n✓ passkey creator flow works end to end");
