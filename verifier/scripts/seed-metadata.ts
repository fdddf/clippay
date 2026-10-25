// Give the demo campaigns (pnpm seed) their off-chain details: brand logos and
// briefs from docs/briefs, attached by each brand after signing in with its
// wallet, plus display names for the demo creators. Exercises the API's
// upload, sign-in and edit paths end to end.
//
//   API_URL=http://localhost:8790 pnpm seed:metadata     # local wrangler dev
//   API_URL=https://clippay.umesok.workers.dev pnpm seed:metadata
import { readFileSync } from "node:fs";
import { Keypair, authorizeEntry, xdr } from "@stellar/stellar-sdk";
import { env } from "./config.ts";
import type { Brief } from "../../web/src/lib/brief.ts";
import type { Campaign } from "../../web/src/lib/api-types.ts";

const API = (process.env.API_URL ?? "http://localhost:8790").replace(/\/$/, "");
const NETWORK = process.env.NETWORK || "testnet";
const root = new URL("../../", import.meta.url);
const keys: Record<string, string> = JSON.parse(readFileSync(new URL(`.seed/${NETWORK}.json`, root), "utf8"));

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await fetch(`${API}${path}`, init);
  // The API rate-limits sign-ins and uploads per IP; wait out the window.
  for (let i = 0; res.status === 429 && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 61_000));
    res = await fetch(`${API}${path}`, init);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${body.error ?? res.status}`);
  return body;
}

async function signIn(kp: Keypair): Promise<string> {
  const c = await call<{ id: string; entry: string; expirationLedger: number }>(
    `/api/auth/challenge?address=${kp.publicKey()}`,
  );
  const signed = await authorizeEntry(
    xdr.SorobanAuthorizationEntry.fromXDR(c.entry, "base64"),
    kp,
    c.expirationLedger,
    env("NETWORK_PASSPHRASE"),
  );
  const { token } = await call<{ token: string }>("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: c.id, entry: signed.toXDR("base64") }),
  });
  return token;
}

async function upload(file: URL): Promise<string> {
  const { hash } = await call<{ hash: string }>("/api/media", {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: readFileSync(file),
  });
  return hash;
}

/** The brief's Markdown without its title and "fictional brand" lines (shown elsewhere). */
function body(md: string): string {
  return md
    .split("\n")
    .filter((l) => !l.startsWith("# ") && !l.startsWith("*Fictional brand"))
    .join("\n")
    .trim();
}

const brands = [
  {
    key: "pixel-harbor",
    titleStarts: "Pixel Harbor",
    file: "pixel-harbor-tidewalker.md",
    brief: {
      brand: { name: "Pixel Harbor", website: null },
      platform: "youtube",
      category: "gaming",
      summary: "Short gameplay clips of Tidewalker, a cozy tide-pool exploration game, for launch week.",
      rules: ["Include #ad in the title or description", "Show or say “Tidewalker” in the first 5 seconds", "30–60 seconds, vertical"],
      exampleUrl: null,
    },
  },
  {
    key: "moonfern",
    titleStarts: "Moonfern",
    file: "moonfern-low-orbit.md",
    brief: {
      brand: { name: "Moonfern Records", website: null },
      platform: "any",
      category: "music",
      summary: "Edits and montages soundtracked by the new single “Low Orbit”.",
      rules: ["Include #ad in the description", "Use at least 15 seconds of the track", "Credit “Low Orbit — Moonfern Records”"],
      exampleUrl: null,
    },
  },
  {
    key: "kitebase",
    titleStarts: "Kitebase",
    file: "kitebase-walkthrough.md",
    brief: {
      brand: { name: "Kitebase", website: null },
      platform: "youtube",
      category: "apps",
      summary: "Honest 60-second walkthroughs of Kitebase, the shared packing list for group trips.",
      rules: ["Include #ad in the description", "Show inviting a friend and checking items off", "Keep it under 60 seconds"],
      exampleUrl: null,
    },
  },
] as const;

const creatorNames = ["Mia Torres", "Jun Park", "Ade Okafor", "Lucía Ramos", "Sam Rivera", "Noor Haddad", "Tomás Silva"];

const campaigns = await call<Campaign[]>("/api/campaigns");
for (const b of brands) {
  const c = campaigns.find((x) => x.title.startsWith(b.titleStarts));
  const secret = keys[`brand:${b.key}`];
  if (!c || !secret) {
    console.log(`- ${b.titleStarts}: no campaign or key, skipped`);
    continue;
  }
  const kp = Keypair.fromSecret(secret);
  const logo = await upload(new URL(`docs/briefs/logos/${b.key}.png`, root));
  const brief: Brief = {
    v: 1,
    ...b.brief,
    rules: [...b.brief.rules],
    brand: { ...b.brief.brand, logo },
    body: body(readFileSync(new URL(`docs/briefs/${b.file}`, root), "utf8")),
    demo: true,
  };
  const { hash } = await call<{ hash: string }>("/api/briefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(brief),
  });
  const token = await signIn(kp);
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  await call(`/api/campaigns/${c.id}/brief`, { method: "PUT", headers: auth, body: JSON.stringify({ hash }) });
  await call("/api/profile", {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ name: b.brief.brand.name, avatar: logo }),
  });
  console.log(`+ #${c.id} ${b.brief.brand.name}: brief ${hash.slice(0, 10)}…`);
}

let n = 0;
for (const [name, secret] of Object.entries(keys)) {
  if (!name.startsWith("creator:")) continue;
  const kp = Keypair.fromSecret(secret);
  const token = await signIn(kp);
  await call("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: creatorNames[n % creatorNames.length] }),
  });
  console.log(`+ ${kp.publicKey().slice(0, 6)}… is ${creatorNames[n % creatorNames.length]}`);
  n++;
}
