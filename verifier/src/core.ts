// Runtime-agnostic verifier: settlement + fee relay behind a fetch-style handler.
// Used by the Node server (index.ts) and the Cloudflare Worker (worker.ts).
import { Keypair, contract } from "@stellar/stellar-sdk";
import {
  allSubmissions,
  describeError,
  earnedAt,
  fromUnits,
  poolClient,
  unwrap,
  type Campaign,
  type PoolClient,
  type Submission,
} from "@clippay/pool-client";
import { mockProvider, youtubeProvider, type PostStats, type ViewProvider } from "./views.ts";
import { check, type Previous, type Rules } from "./checks.ts";
import { createRelay } from "./relay.ts";
import { rateLimiter } from "./limits.ts";

/** Reads a config value; throws if missing and no fallback is given. */
export type EnvReader = (key: string, fallback?: string) => string;

export function envReader(source: Record<string, string | undefined>): EnvReader {
  return (key, fallback) => {
    const v = source[key] || fallback;
    if (v === undefined) throw new Error(`missing env ${key}`);
    return v;
  };
}

interface SettleResult {
  creator: string;
  views?: string;
  paid?: string;
  skipped?: string;
  error?: string;
}

/** What the verifier last concluded about a post; served at GET /status/:id. */
export interface PostStatus {
  /** Latest view count seen off-chain (may be ahead of the on-chain count). */
  views: string;
  checkedAt: number;
  /** Creator-fixable problems; re-checked every pass. */
  fixable: string[];
  /** Anti-fraud flags; sticky until a reviewer decides. */
  review: string[];
  decision?: "approved" | "rejected";
  error?: string;
}

export type Verifier = Awaited<ReturnType<typeof createVerifier>>;

export async function createVerifier(env: EnvReader) {
  const keypair = Keypair.fromSecret(env("VERIFIER_SECRET"));
  const networkPassphrase = env("NETWORK_PASSPHRASE");
  const pool = await poolClient({
    contractId: env("CONTRACT_ID"),
    rpcUrl: env("RPC_URL"),
    networkPassphrase,
    publicKey: keypair.publicKey(),
    ...contract.basicNodeSigner(keypair, networkPassphrase),
  });

  const relay = createRelay({
    rpcUrl: env("RPC_URL"),
    networkPassphrase,
    poolContractId: env("CONTRACT_ID"),
    tokenId: env("TOKEN_ID"),
    accountWasmHash: env("ACCOUNT_WASM_HASH"),
    deployer: env("SMART_ACCOUNT_DEPLOYER"),
    sponsorSecret: env("SPONSOR_SECRET", "") || undefined,
    channelsUrl: env("OZ_CHANNELS_URL", "https://channels.openzeppelin.com/testnet"),
    channelsApiKey: env("OZ_CHANNELS_API_KEY", "") || undefined,
    maxFee: BigInt(Math.round(Number(env("SPONSOR_MAX_FEE_XLM", "100")) * 1e7)),
    perIpPerMinute: Number(env("RELAY_PER_IP_PER_MINUTE", "20")),
    perWalletPerMinute: Number(env("RELAY_PER_WALLET_PER_MINUTE", "6")),
  });
  const sponsorMin = BigInt(Math.round(Number(env("SPONSOR_MIN_XLM", "200")) * 1e7));
  const alertUrl = env("ALERT_WEBHOOK_URL", "");
  const reviewToken = env("REVIEW_TOKEN", "");
  const settleLimit = rateLimiter(Number(env("SETTLE_PER_IP_PER_MINUTE", "6")));

  const provider: ViewProvider =
    env("VIEW_PROVIDER", "mock") === "youtube"
      ? youtubeProvider(env("YOUTUBE_API_KEY"))
      : mockProvider(Number(env("MOCK_VIEWS_PER_SECOND", "40")));
  const flag = (k: string, fallback: string) => env(k, fallback) === "true";
  const rules: Rules = {
    requireOwnershipTag: flag("REQUIRE_OWNERSHIP_TAG", "true"),
    requireAdDisclosure: flag("REQUIRE_AD_DISCLOSURE", "true"),
    maxViewsPerHour: Number(env("MAX_VIEWS_PER_HOUR", "500000")),
    minLikeRatio: Number(env("MIN_LIKE_RATIO", "0.002")),
    minViewsForEngagement: Number(env("MIN_VIEWS_FOR_ENGAGEMENT", "5000")),
    minChannelAgeDays: Number(env("MIN_CHANNEL_AGE_DAYS", "7")),
  };

  const status = new Map<string, PostStatus>();
  const lastSeen = new Map<string, Previous>();
  /** Post metadata from the latest fetch, for the checks. */
  const lastStats = new Map<string, Omit<PostStats, "views">>();
  const key = (id: number, creator: string) => `${id}:${creator}`;

  /** Runs the checks for one post; returns why it can't be paid, if it can't. */
  function holdReason(id: number, sub: Submission, views: bigint): string | undefined {
    const k = key(id, sub.creator);
    const now = Date.now() / 1000;
    const prev = status.get(k);
    const hold = check(sub, { views, ...lastStats.get(k) }, lastSeen.get(k), rules, now);
    const review = [...new Set([...(prev?.review ?? []), ...hold.review])];
    const s: PostStatus = {
      views: views.toString(),
      checkedAt: Math.floor(now),
      fixable: hold.fixable,
      review,
      decision: prev?.decision,
    };
    status.set(k, s);
    lastSeen.set(k, { views, at: now });
    if (s.decision === "rejected") return "rejected by review";
    if (review.length && s.decision !== "approved") return `held for review: ${review.join("; ")}`;
    if (hold.fixable.length) return `on hold: ${hold.fixable.join("; ")}`;
  }

  /** Settle every submission of one campaign. */
  async function settleCampaign(client: PoolClient, id: number): Promise<SettleResult[]> {
    const campaign = unwrap((await client.get_campaign({ id })).result);
    const grace = (await client.settle_grace()).result;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (campaign.refunded || now > campaign.deadline + grace) return [];

    const subs = await allSubmissions(client, campaign);
    const out: SettleResult[] = [];
    for (const sub of subs) {
      const r: SettleResult = { creator: sub.creator };
      try {
        if (sub.paid + sub.fee >= campaign.cap_per_creator) {
          r.skipped = "at cap";
        } else if (campaign.remaining === 0n) {
          r.skipped = "budget spent";
        } else {
          const { views, ...meta } = await provider.stats(sub);
          lastStats.set(key(id, sub.creator), meta);
          r.views = views.toString();
          const held = holdReason(id, sub, views);
          if (held) r.skipped = held;
          else if (views <= sub.views) r.skipped = "no new views";
          else if (owed(campaign, sub, views) === 0n) r.skipped = "nothing owed yet";
          else {
            // Transactions from the verifier account are sent one at a time, so
            // sequence numbers never collide.
            const tx = await client.settle({ id, creator: sub.creator, views });
            const sent = await tx.signAndSend();
            r.paid = unwrap(sent.result).toString();
          }
        }
      } catch (e) {
        r.error = describeError(e);
        const s = status.get(key(id, sub.creator));
        if (s) s.error = r.error;
      }
      out.push(r);
    }
    return out;
  }

  async function settleAll() {
    const count = (await pool.campaign_count()).result;
    for (let id = 0; id < count; id++) {
      try {
        const results = await settleCampaign(pool, id);
        for (const r of results) log(id, r);
      } catch (e) {
        console.error(`[campaign ${id}]`, describeError(e));
      }
    }
    await watchSponsor();
  }

  let sponsorLow = false;
  /** Warns (and calls ALERT_WEBHOOK_URL) when the fee sponsor runs low. */
  async function watchSponsor() {
    const balance = await relay.sponsorBalance().catch(() => null);
    if (balance === null) return;
    const low = balance < sponsorMin;
    if (low && !sponsorLow) {
      const text = `ClipPay sponsor ${relay.sponsor} is low: ${fromUnits(balance)} XLM (alert below ${fromUnits(sponsorMin)})`;
      console.warn(`[alert] ${text}`);
      if (alertUrl) {
        await fetch(alertUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, content: text }),
        }).catch((e) => console.error("[alert] webhook failed", describeError(e)));
      }
    }
    sponsorLow = low;
  }

  function log(id: number, r: SettleResult) {
    const who = `${r.creator.slice(0, 6)}…${r.creator.slice(-4)}`;
    const what = r.error ? `error: ${r.error}` : r.skipped ?? `views ${r.views} → paid ${r.paid}`;
    console.log(`[campaign ${id}] ${who} ${what}`);
  }

  // One settlement pass at a time, whether triggered by the timer or over HTTP.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  }

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Name, X-Client-Version",
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  /**
   * Routes: GET /health · GET /status/:id · POST /settle/:id (the web app's
   * "Verify now") · POST /review/:id/:creator (reviewer, bearer REVIEW_TOKEN) ·
   * POST /relay (smart-account-kit `relayerUrl`).
   */
  async function handle(
    req: Request,
    caller: { ip: string },
    path = new URL(req.url).pathname,
  ): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (req.method === "GET" && path === "/health") {
      const balance = await relay.sponsorBalance().catch(() => null);
      return json(200, {
        verifier: keypair.publicKey(),
        provider: provider.name,
        rules,
        relay: relay.mode,
        sponsor: relay.sponsor,
        sponsorBalance: balance === null ? null : fromUnits(balance),
        sponsorLow: balance !== null && balance < sponsorMin,
      });
    }
    if (req.method === "POST" && path === "/relay") {
      const body = await req.json().catch(() => null);
      const result = await relay.handle(body, caller);
      if (!result.success) console.warn(`[relay] rejected: ${result.error}`);
      else console.log(`[relay] ${result.data.hash}`);
      return json(result.success ? 200 : 400, result);
    }
    const st = path.match(/^\/status\/(\d+)$/);
    if (req.method === "GET" && st) {
      const prefix = `${st[1]}:`;
      const posts = Object.fromEntries(
        [...status].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]),
      );
      return json(200, { id: Number(st[1]), posts });
    }
    const rv = path.match(/^\/review\/(\d+)\/(\w+)$/);
    if (req.method === "POST" && rv) {
      if (!reviewToken || req.headers.get("Authorization") !== `Bearer ${reviewToken}`) {
        return json(401, { error: "unauthorized" });
      }
      const body = (await req.json().catch(() => ({}))) as { approve?: boolean };
      const s = status.get(key(Number(rv[1]), rv[2]));
      if (!s) return json(404, { error: "no such post" });
      s.decision = body.approve ? "approved" : "rejected";
      console.log(`[review] ${rv[1]}:${rv[2]} ${s.decision}`);
      return json(200, s);
    }
    const m = path.match(/^\/settle\/(\d+)$/);
    if (req.method === "POST" && m) {
      if (!settleLimit.take(caller.ip)) return json(429, { error: "Too many checks — try again in a minute" });
      const id = Number(m[1]);
      try {
        const results = await serial(() => settleCampaign(pool, id));
        results.forEach((r) => log(id, r));
        return json(200, { id, results });
      } catch (e) {
        return json(400, { error: describeError(e) });
      }
    }
    return json(404, { error: "not found" });
  }

  return {
    publicKey: keypair.publicKey(),
    provider,
    relay,
    pool,
    handle,
    settleAll: () => serial(settleAll),
  };
}

/** What settling at `views` would move out of the campaign (payout + fee). */
function owed(c: Campaign, sub: Submission, views: bigint): bigint {
  const due = earnedAt(c, views) - (sub.paid + sub.fee);
  if (due <= 0n) return 0n;
  return due < c.remaining ? due : c.remaining;
}
