// Seed the deployed CampaignPool with demo campaigns (docs/briefs) and a few
// creator submissions. Brands and creators are fresh friendbot-funded testnet
// accounts; their keys are kept in .seed/<network>.json so reruns reuse them.
// Campaigns whose title already exists are skipped.
//
//   pnpm seed
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Keypair, contract } from "@stellar/stellar-sdk";
import { describeError, poolClient, toUnits, unwrap, type PoolClient } from "@clippay/pool-client";
import { env } from "./config.ts";

const NETWORK = process.env.NETWORK || "testnet";
const REPO = "https://github.com/fdddf/clippay/blob/main/docs/briefs";
const DAY = 86_400;

const campaigns = [
  {
    key: "pixel-harbor",
    title: "Pixel Harbor — Tidewalker launch clips",
    brief: `${REPO}/pixel-harbor-tidewalker.md`,
    budget: "400",
    rate: "0.8",
    cap: "40",
    days: 6,
    creators: 3,
  },
  {
    key: "moonfern",
    title: "Moonfern Records — “Low Orbit” single",
    brief: `${REPO}/moonfern-low-orbit.md`,
    budget: "250",
    rate: "0.5",
    cap: "25",
    days: 4,
    creators: 2,
  },
  {
    key: "kitebase",
    title: "Kitebase — 60-second app walkthrough",
    brief: `${REPO}/kitebase-walkthrough.md`,
    budget: "150",
    rate: "1.2",
    cap: "30",
    days: 2,
    creators: 2,
  },
];

// ---------------------------------------------------------------- accounts

const keyFile = `${new URL("../../.seed/", import.meta.url).pathname}${NETWORK}.json`;
const keys: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync(keyFile, "utf8"));
  } catch {
    return {};
  }
})();

async function account(name: string): Promise<Keypair> {
  if (keys[name]) return Keypair.fromSecret(keys[name]);
  const kp = Keypair.random();
  const res = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  if (!res.ok) throw new Error(`friendbot ${res.status} for ${name}`);
  keys[name] = kp.secret();
  mkdirSync(new URL("../../.seed/", import.meta.url), { recursive: true });
  writeFileSync(keyFile, JSON.stringify(keys, null, 2));
  return kp;
}

function clientFor(kp: Keypair): Promise<PoolClient> {
  return poolClient({
    contractId: env("CONTRACT_ID"),
    rpcUrl: env("RPC_URL"),
    networkPassphrase: env("NETWORK_PASSPHRASE"),
    publicKey: kp.publicKey(),
    ...contract.basicNodeSigner(kp, env("NETWORK_PASSPHRASE")),
  });
}

/** A stable, YouTube-shaped placeholder link for a seeded post. */
function placeholderUrl(seed: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let h = 0x811c9dc5;
  let id = "";
  for (let i = 0; i < 11; i++) {
    for (const ch of seed + i) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    id += alphabet[h % 64];
  }
  return `https://youtube.com/shorts/${id}`;
}

// -------------------------------------------------------------------- seed

const reader = await poolClient({
  contractId: env("CONTRACT_ID"),
  rpcUrl: env("RPC_URL"),
  networkPassphrase: env("NETWORK_PASSPHRASE"),
});
const count = (await reader.campaign_count()).result;
const existing = new Set<string>();
for (let id = 0; id < count; id++) existing.add(unwrap((await reader.get_campaign({ id })).result).title);

for (const c of campaigns) {
  if (existing.has(c.title)) {
    console.log(`= ${c.title} (exists)`);
    continue;
  }
  const brand = await account(`brand:${c.key}`);
  const pool = await clientFor(brand);
  const tx = await pool.create_campaign({
    brand: brand.publicKey(),
    token: env("TOKEN_ID"),
    title: c.title,
    brief_url: c.brief,
    budget: toUnits(c.budget),
    rate_per_1k: toUnits(c.rate),
    cap_per_creator: toUnits(c.cap),
    deadline: BigInt(Math.floor(Date.now() / 1000) + c.days * DAY),
  });
  const id = unwrap((await tx.signAndSend()).result);
  console.log(`+ #${id} ${c.title}`);

  for (let n = 0; n < c.creators; n++) {
    try {
      const creator = await account(`creator:${c.key}:${n}`);
      const as = await clientFor(creator);
      const sub = await as.submit({
        id,
        creator: creator.publicKey(),
        url: placeholderUrl(`${c.key}:${n}`),
      });
      unwrap((await sub.signAndSend()).result);
      console.log(`  ↳ ${creator.publicKey().slice(0, 6)}… submitted`);
    } catch (e) {
      console.error(`  ↳ creator ${n} failed: ${describeError(e)}`);
    }
  }
}
console.log(`\nKeys in ${keyFile}. The verifier pays these posts on its next pass.`);
