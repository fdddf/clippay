// Cash-out check against the SDF test anchor, without a browser:
//   software-passkey smart wallet → SEP-45 auth → SEP-24 withdrawal → (you complete
//   the anchor's form) → wallet pays the anchor via the sponsored /relay.
//
//   pnpm e2e:anchor [amount]
import {
  authenticate,
  buildWithdrawalPayment,
  getTransaction,
  loadAnchor,
  paymentDestination,
  startWithdraw,
} from "@clippay/anchor";
import { scriptKit } from "./soft-passkey.ts";

import { env } from "./config.ts";
const verifierUrl = `http://localhost:${process.env.PORT ?? 8787}`;
const amount = process.argv[2] ?? "2";
const step = (s: string) => console.log(`\n▸ ${s}`);

const kit = scriptKit(env, verifierUrl);

step("create + fund a passkey wallet");
const created = await kit.createWallet("ClipPay", "e2e-anchor", { autoSubmit: true });
if (created.submitResult && !created.submitResult.success) throw created.submitResult.error;
const wallet = created.contractId;
const funded = await kit.fundWallet(env("TOKEN_ID"));
if (!funded.success) throw funded.error;
console.log(`  wallet ${wallet} · funded ${funded.amount ?? "?"} XLM`);

step("SEP-45: authenticate the smart account with the anchor");
const anchor = await loadAnchor(process.env.ANCHOR_DOMAIN ?? "testanchor.stellar.org");
const jwt = await authenticate(anchor, wallet, (entry) => kit.signAuthEntry(entry, { contextRuleIds: [0] }));
console.log(`  JWT ${jwt.slice(0, 24)}…`);

step(`SEP-24: start a ${amount} XLM withdrawal`);
const started = await startWithdraw(anchor, jwt, { assetCode: "native", account: wallet, amount });
console.log(`  id ${started.id}`);
console.log(`  open this to enter (test) bank details:\n  ${started.url}`);

step("waiting for the anchor to ask for funds (complete the form above)…");
let tx = await getTransaction(anchor, jwt, started.id);
for (let i = 0; i < 120 && tx.status !== "pending_user_transfer_start"; i++) {
  if (i % 6 === 0) console.log(`  status ${tx.status}`);
  await new Promise((r) => setTimeout(r, 5000));
  tx = await getTransaction(anchor, jwt, started.id);
}
console.log("  ", JSON.stringify(tx, null, 2));
if (tx.status !== "pending_user_transfer_start") process.exit(1);

step("pay the anchor from the smart wallet (fee sponsored)");
const payment = await buildWithdrawalPayment({
  rpcUrl: env("RPC_URL"),
  networkPassphrase: env("NETWORK_PASSPHRASE"),
  tokenId: env("TOKEN_ID"),
  from: wallet,
  tx,
});
const paid = await kit.signAndSubmit(payment);
if (!paid.success) throw paid.error;
console.log(`  sent to ${paymentDestination(tx)} · tx ${paid.hash}`);

step("waiting for the anchor to pay out…");
for (let i = 0; i < 60; i++) {
  tx = await getTransaction(anchor, jwt, started.id);
  if (["completed", "error", "refunded"].includes(tx.status)) break;
  if (i % 3 === 0) console.log(`  status ${tx.status}`);
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(`  final status ${tx.status}`, tx.message ?? "");
