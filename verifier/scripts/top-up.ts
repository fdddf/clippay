// Add budget to a seeded demo campaign, signed with its brand's seed key.
//
//   pnpm --filter verifier top-up <brand key> <campaign id> <amount>
//   pnpm --filter verifier top-up kitebase 2 300
//
// Without an amount it only prints the campaign and the brand's balance.
import { readFileSync } from "node:fs";
import { Keypair, contract } from "@stellar/stellar-sdk";
import { describeError, poolClient, toUnits, unwrap } from "@clippay/pool-client";
import { env } from "./config.ts";

const NETWORK = process.env.NETWORK || "testnet";
const [brand, idArg, amountArg] = process.argv.slice(2);
if (!brand || !idArg) {
  console.error("usage: top-up <brand key> <campaign id> [amount]");
  process.exit(1);
}
const keys: Record<string, string> = JSON.parse(readFileSync(new URL(`../../.seed/${NETWORK}.json`, import.meta.url), "utf8"));
const secret = keys[`brand:${brand}`];
if (!secret) throw new Error(`no seed key brand:${brand} in .seed/${NETWORK}.json`);
const kp = Keypair.fromSecret(secret);
const id = Number(idArg);

const pool = await poolClient({
  contractId: env("CONTRACT_ID"),
  rpcUrl: env("RPC_URL"),
  networkPassphrase: env("NETWORK_PASSPHRASE"),
  publicKey: kp.publicKey(),
  ...contract.basicNodeSigner(kp, env("NETWORK_PASSPHRASE")),
});

const show = async (label: string) => {
  const c = unwrap((await pool.get_campaign({ id })).result);
  if (c.brand !== kp.publicKey()) throw new Error(`campaign ${id} belongs to ${c.brand}, not brand:${brand}`);
  const xlm = (n: bigint) => (Number(n) / 1e7).toFixed(2);
  console.log(`${label}: budget ${xlm(c.budget)}, remaining ${xlm(c.remaining)}, deadline ${new Date(Number(c.deadline) * 1000).toISOString()}`);
};

await show("before");
const account = (await fetch(`https://horizon-${NETWORK}.stellar.org/accounts/${kp.publicKey()}`).then((r) => r.json())) as {
  balances?: { asset_type: string; balance: string }[];
};
console.log(`brand balance: ${account.balances?.find((b) => b.asset_type === "native")?.balance} XLM`);
if (amountArg) {
  try {
    const tx = await pool.top_up({ id, from: kp.publicKey(), amount: toUnits(amountArg) });
    const sent = await tx.signAndSend();
    unwrap(sent.result);
    console.log(`topped up ${amountArg}: ${sent.sendTransactionResponse?.hash}`);
  } catch (e) {
    console.error(describeError(e));
    process.exit(1);
  }
  await show("after");
}
