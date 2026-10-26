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
import { mockProvider, postKey, youtubeProvider, type PostStats, type ViewProvider } from "./views.ts";
import { check, claimPost, showsTag, type Previous, type Rules, type Start } from "./checks.ts";
import { createRelay } from "./relay.ts";
import { rateLimiter } from "./limits.ts";
import { deployment } from "@clippay/deployments";

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

export interface VerifierHooks {
  /** When a campaign was created (unix seconds), if known; the Worker reads it from its event index. */
  campaignStart?: (id: number) => Promise<number | undefined>;
}

export async function createVerifier(env: EnvReader, hooks: VerifierHooks = {}) {
  // Contract IDs come from deployments/<network>.json; env vars may override them.
  const d = deployment(env("NETWORK", "testnet"));
  const keypair = Keypair.fromSecret(env("VERIFIER_SECRET"));
  const networkPassphrase = env("NETWORK_PASSPHRASE", d.networkPassphrase);
  const pool = await poolClient({
    contractId: env("CONTRACT_ID", d.campaignPool.contractId),
    rpcUrl: env("RPC_URL", d.rpcUrl),
    networkPassphrase,
    publicKey: keypair.publicKey(),
    ...contract.basicNodeSigner(keypair, networkPassphrase),
  });

  const relay = createRelay({
    rpcUrl: env("RPC_URL", d.rpcUrl),
    networkPassphrase,
    poolContractId: env("CONTRACT_ID", d.campaignPool.contractId),
    tokenId: env("TOKEN_ID", d.token.id),
    accountWasmHash: env("ACCOUNT_WASM_HASH", d.smartAccount.wasmHash),
    deployer: env("SMART_ACCOUNT_DEPLOYER", d.smartAccount.deployer),
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
      : mockProvider(Number(env("MOCK_VIEWS_PER_SECOND", "10")));
  const flag = (k: string, fallback: string) => env(k, fallback) === "true";
  const rules: Rules = {
    requireOwnershipTag: flag("REQUIRE_OWNERSHIP_TAG", "true"),
    requireAdDisclosure: flag("REQUIRE_AD_DISCLOSURE", "true"),
    maxViewsPerHour: Number(env("MAX_VIEWS_PER_HOUR", "500000")),
    minLikeRatio: Number(env("MIN_LIKE_RATIO", "0.002")),
    minViewsForEngagement: Number(env("MIN_VIEWS_FOR_ENGAGEMENT", "5000")),
    minChannelAgeDays: Number(env("MIN_CHANNEL_AGE_DAYS", "7")),
    requireNewPost: flag("REQUIRE_NEW_POST", "true"),
  };

  const status = new Map<string, PostStatus>();
  const lastSeen = new Map<string, Previous>();
  /** Post metadata from the latest fetch, for the checks. */
  const lastStats = new Map<string, Omit<PostStats, "views">>();
  const key = (id: number, creator: string) => `${id}:${creator}`;
  /** `${campaign}:${postKey}` → the creator who owns that post. */
  const owners = new Map<string, string>();
  /** Campaign creation times, once known. */
  const starts = new Map<number, number>();

  /**
   * When campaign `id` started: its creation time if known, else its first
   * entry, which is only an upper bound.
   */
  async function startOf(id: number, subs: Submission[]): Promise<Start | undefined> {
    if (!rules.requireNewPost || !provider.hasMetadata) return;
    if (!starts.has(id)) {
      const at = await hooks.campaignStart?.(id).catch(() => undefined);
      if (at !== undefined) starts.set(id, at);
    }
    const at = starts.get(id);
    if (at !== undefined) return { at, exact: true };
    if (!subs.length) return;
    return { at: Math.min(...subs.map((s) => Number(s.submitted_at))), exact: false };
  }

  /** Runs the checks for one post; returns why it can't be paid, if it can't. */
  function holdReason(id: number, sub: Submission, views: bigint, start?: Start): string | undefined {
    const k = key(id, sub.creator);
    const now = Date.now() / 1000;
    const prev = status.get(k);
    const stats = { views, ...lastStats.get(k) };
    const hold = check(sub, stats, lastSeen.get(k), rules, now, start);
    const taken = claimPost(owners, `${id}:${postKey(sub.url)}`, sub.creator, showsTag(sub, stats, rules));
    if (taken) hold.review.push(taken);
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

  /** Settle every submission of one campaign (or only `creator`'s). */
  async function settleCampaign(client: PoolClient, id: number, creator?: string): Promise<SettleResult[]> {
    const campaign = unwrap((await client.get_campaign({ id })).result);
    const grace = (await client.settle_grace()).result;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (campaign.refunded || now > campaign.deadline + grace) return [];

    const all = await allSubmissions(client, campaign);
    // A post already paid out belongs to whoever was paid (in entry order), so
    // ownership survives a restart.
    for (const s of all) if (s.paid + s.fee > 0n) claimPost(owners, `${id}:${postKey(s.url)}`, s.creator, true);
    const start = await startOf(id, all);
    const subs = all.filter((x) => !creator || x.creator === creator);
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
          const held = holdReason(id, sub, views, start);
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
   * Routes: GET /health · GET /status/:id · POST /settle/:id[?creator=…] (the
   * web app's "Refresh my views") · POST /review/:id/:creator (reviewer, bearer REVIEW_TOKEN) ·
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
      const creator = new URL(req.url).searchParams.get("creator") ?? undefined;
      try {
        const results = await serial(() => settleCampaign(pool, id, creator));
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
