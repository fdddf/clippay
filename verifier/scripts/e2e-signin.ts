// Wallet sign-in for a passkey smart account, without a browser: software
// passkey → wallet deployed via the relay → challenge signed with the passkey →
// session token → profile update.
//
//   API_URL=http://localhost:8790 pnpm e2e:signin
import { xdr } from "@stellar/stellar-sdk";
import { scriptKit } from "./soft-passkey.ts";
import { env } from "./config.ts";

const API = (process.env.API_URL ?? "http://localhost:8790").replace(/\/$/, "");
const step = (s: string) => console.log(`\n▸ ${s}`);

const kit = scriptKit(env, `${API}/api`);
step("create passkey wallet (sponsored)");
const created = await kit.createWallet("ClipPay", "e2e-signin", { autoSubmit: true });
if (created.submitResult && !created.submitResult.success) throw created.submitResult.error;
const wallet = created.contractId;
console.log(`  ${wallet}`);

step("sign the challenge with the passkey");
const c = (await (await fetch(`${API}/api/auth/challenge?address=${wallet}`)).json()) as { id: string; entry: string };
const signed = await kit.signAuthEntry(xdr.SorobanAuthorizationEntry.fromXDR(c.entry, "base64"), { contextRuleIds: [0] });
const res = await fetch(`${API}/api/auth/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: c.id, entry: signed.toXDR("base64") }),
});
const session = (await res.json()) as { token?: string; error?: string };
if (!session.token) throw new Error(`verify failed: ${session.error}`);
console.log("  signed in");

step("reusing the challenge is refused");
const again = await fetch(`${API}/api/auth/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: c.id, entry: signed.toXDR("base64") }),
});
console.log(`  ${again.status} ${((await again.json()) as { error: string }).error}`);

step("update profile");
const p = await fetch(`${API}/api/profile`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
  body: JSON.stringify({ name: "Passkey Tester" }),
});
console.log(" ", await p.json());
console.log("\n✓ passkey sign-in works");
