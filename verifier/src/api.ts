// Read API and off-chain data for the web app. Stateless: runs in the Worker
// itself, not in the verifier's Durable Object, so reads never wait behind a
// settlement pass. Chain state is read over RPC and cached for a few seconds
// per isolate; history comes from the D1 event index (indexer.ts).
//
//   GET  /api/stats                    totals for the landing page
//   GET  /api/campaigns                every campaign, with its brief
//   GET  /api/campaigns/:id            one campaign, its posts, checks and history
//   GET  /api/campaigns/:id/daily[?by=hour]  spend and new views per day or hour (UTC)
//   GET  /api/accounts/:address        dashboard data for one account
//   GET  /api/events?campaign=&address=&type=&limit=   with each address's profile
//   GET  /api/briefs/:hash · POST /api/briefs           content-addressed briefs
//   GET  /api/media/:hash[?w=64|128]  · POST /api/media  content-addressed images (w: square thumbnail)
//   GET  /api/auth/challenge?address=  · POST /api/auth/verify   wallet sign-in
//   GET  /api/me · PUT /api/profile                     the signed-in account's profile
//   PUT  /api/campaigns/:id/brief                       brand attaches a brief (signed in)
//   GET  /api/og/c/:id.png                              a campaign's share image
import {
  allSubmissions,
  poolClient,
  unwrap,
  type Campaign as RawCampaign,
  type PoolClient,
  type Submission as RawSubmission,
} from "@clippay/pool-client";
import { deployment } from "@clippay/deployments";
import { StrKey } from "@stellar/stellar-sdk";
import type {
  Account,
  Campaign,
  CampaignDetail,
  CampaignStatus,
  ChainEvent,
  PostCheck,
  Profile,
  Stats,
  Submission,
} from "../../web/src/lib/api-types.ts";
import {
  briefHash,
  canonicalJson,
  hashFromBriefUrl,
  sha256Hex,
  validateBrief,
  type Brief,
} from "../../web/src/lib/brief.ts";
import { campaignOgPng, thumbnailPng } from "./og.ts";
import { createSessions } from "./session.ts";
import { rateLimiter } from "./limits.ts";

export interface ApiEnv {
  DB: D1Database;
  NETWORK?: string;
  SESSION_SECRET?: string;
  /** Fetches the verifier Durable Object (for per-post checks). */
  verifierFetch(path: string): Promise<Response>;
}


const CACHE_MS = 10_000;
const MEDIA_MAX = 256 * 1024;
/** Thumbnail widths `GET /api/media/:hash?w=` serves: 2× the avatar sizes in the app. */
const THUMB_SIZES = [64, 128];
const MEDIA_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) =>
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

const writeLimit = rateLimiter(20);
const authLimit = rateLimiter(10);

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
const fail = (status: number, error: string) => json({ error }, status);

// ------------------------------------------------------------------ chain

interface Snapshot {
  at: number;
  grace: number;
  campaigns: RawCampaign[];
  submissions: Map<number, RawSubmission[]>;
}

let snapshot: Promise<Snapshot> | null = null;
let snapshotAt = 0;
let client: Promise<PoolClient> | null = null;

function chain(network: string) {
  const d = deployment(network);
  client ??= poolClient({
    contractId: d.campaignPool.contractId,
    rpcUrl: d.rpcUrl,
    networkPassphrase: d.networkPassphrase,
  });
  return { d, client };
}

/** Every campaign and submission, read over RPC; shared by concurrent requests. */
function readChain(network: string, fresh = false): Promise<Snapshot> {
  if (!fresh && snapshot && Date.now() - snapshotAt < CACHE_MS) return snapshot;
  snapshotAt = Date.now();
  snapshot = (async () => {
    const pool = await chain(network).client;
    const [count, grace] = await Promise.all([pool.campaign_count(), pool.settle_grace()]);
    const campaigns = await Promise.all(
      Array.from({ length: count.result }, async (_, id) => unwrap((await pool.get_campaign({ id })).result)),
    );
    const subs = await Promise.all(campaigns.map((c) => allSubmissions(pool, c)));
    return {
      at: Date.now(),
      grace: Number(grace.result),
      campaigns,
      submissions: new Map(campaigns.map((c, i) => [c.id, subs[i]!])),
    };
  })();
  snapshot.catch(() => {
    snapshot = null;
  });
  return snapshot;
}

function status(c: RawCampaign, grace: number, now = Date.now() / 1000): CampaignStatus {
  if (c.refunded) return "closed";
  if (c.remaining === 0n) return "spent";
  const deadline = Number(c.deadline);
  if (now > deadline + grace) return "closed";
  if (now > deadline) return "settling";
  if (deadline - now < 86_400) return "ending";
  return "live";
}

// ------------------------------------------------------------- off-chain

async function profiles(db: D1Database, addresses: string[]): Promise<Map<string, Profile>> {
  const unique = [...new Set(addresses)];
  const out = new Map<string, Profile>();
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const { results } = await db
      .prepare(`SELECT address, name, avatar, bio FROM profiles WHERE address IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ address: string; name: string | null; avatar: string | null; bio: string | null }>();
    for (const r of results) {
      out.set(r.address, { ...r, avatar: r.avatar ? `/api/media/${r.avatar}` : null });
    }
  }
  return out;
}

async function briefsFor(db: D1Database, campaigns: RawCampaign[]) {
  const pinned = new Map<number, string>();
  for (const c of campaigns) {
    const h = hashFromBriefUrl(c.brief_url);
    if (h) pinned.set(c.id, h);
  }
  const { results: attached } = await db
    .prepare("SELECT campaign, brief FROM campaign_meta")
    .all<{ campaign: number; brief: string }>();
  const attachedBy = new Map(attached.map((r) => [r.campaign, r.brief]));
  const hashes = [...new Set([...pinned.values(), ...attachedBy.values()])];
  const bodies = new Map<string, Brief>();
  for (let i = 0; i < hashes.length; i += 50) {
    const chunk = hashes.slice(i, i + 50);
    const { results } = await db
      .prepare(`SELECT hash, json FROM briefs WHERE hash IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ hash: string; json: string }>();
    for (const r of results) bodies.set(r.hash, JSON.parse(r.json) as Brief);
  }
  return (c: RawCampaign) => {
    const p = pinned.get(c.id);
    if (p) return { brief: bodies.get(p) ?? null, briefSource: "hash" as const, briefHash: p };
    const a = attachedBy.get(c.id);
    if (a) return { brief: bodies.get(a) ?? null, briefSource: "attached" as const, briefHash: a };
    return { brief: null, briefSource: "external" as const, briefHash: null };
  };
}

function toCampaign(
  c: RawCampaign,
  subs: RawSubmission[],
  grace: number,
  extra: Pick<Campaign, "brief" | "briefSource" | "briefHash" | "brandProfile">,
): Campaign {
  return {
    id: c.id,
    brand: c.brand,
    token: c.token,
    decimals: c.decimals,
    title: c.title,
    briefUrl: c.brief_url,
    budget: c.budget.toString(),
    remaining: c.remaining.toString(),
    ratePer1k: c.rate_per_1k.toString(),
    capPerCreator: c.cap_per_creator.toString(),
    deadline: Number(c.deadline),
    refundAt: Number(c.deadline) + grace,
    refunded: c.refunded,
    feeBps: c.fee_bps,
    creators: c.creators,
    paid: subs.reduce((n, s) => n + s.paid, 0n).toString(),
    fees: c.fees.toString(),
    views: subs.reduce((n, s) => n + s.views, 0n).toString(),
    status: status(c, grace),
    ...extra,
  };
}

function toSubmission(id: number, s: RawSubmission, profile: Profile | null, check: PostCheck | null): Submission {
  return {
    campaign: id,
    creator: s.creator,
    url: s.url,
    submittedAt: Number(s.submitted_at),
    views: s.views.toString(),
    paid: s.paid.toString(),
    fee: s.fee.toString(),
    profile,
    check,
  };
}

async function campaignsView(env: ApiEnv, network: string, fresh = false) {
  const snap = await readChain(network, fresh);
  const brief = await briefsFor(env.DB, snap.campaigns);
  const people = await profiles(env.DB, [
    ...snap.campaigns.map((c) => c.brand),
    ...[...snap.submissions.values()].flat().map((s) => s.creator),
  ]);
  const campaigns = snap.campaigns.map((c) =>
    toCampaign(c, snap.submissions.get(c.id) ?? [], snap.grace, {
      ...brief(c),
      brandProfile: people.get(c.brand) ?? null,
    }),
  );
  return { snap, campaigns, people };
}

async function events(db: D1Database, where: string, binds: unknown[], limit: number): Promise<ChainEvent[]> {
  const { results } = await db
    .prepare(
      `SELECT id, ledger, ts, tx, type, campaign, address, amount, fee, views FROM events ${where}
       ORDER BY ledger DESC, id DESC LIMIT ?`,
    )
    .bind(...binds, Math.min(Math.max(limit, 1), 200))
    .all<ChainEvent>();
  return results;
}

async function postChecks(env: ApiEnv, id: number): Promise<Record<string, PostCheck>> {
  try {
    const res = await env.verifierFetch(`/status/${id}`);
    if (!res.ok) return {};
    return ((await res.json()) as { posts?: Record<string, PostCheck> }).posts ?? {};
  } catch {
    return {};
  }
}

// ----------------------------------------------------------------- routes

// ------------------------------------------------------------- sharing

function brandNameOf(c: Campaign): string {
  return c.brandProfile?.name ?? c.brief?.brand.name ?? `${c.brand.slice(0, 4)}…${c.brand.slice(-4)}`;
}

async function brandLogo(db: D1Database, c: Campaign) {
  const hash = c.brandProfile?.avatar?.split("/").pop() ?? c.brief?.brand.logo ?? null;
  if (!hash) return null;
  const row = await db
    .prepare("SELECT mime, body FROM media WHERE hash = ?")
    .bind(hash)
    .first<{ mime: string; body: number[] | ArrayBuffer }>();
  return row ? { hash, mime: row.mime, body: new Uint8Array(row.body) } : null;
}

/** Title, description and share image for a campaign page, or null if it doesn't exist. */
export async function campaignHead(env: Pick<ApiEnv, "DB" | "NETWORK">, id: number) {
  const network = env.NETWORK ?? "testnet";
  const sym = deployment(network).token.symbol;
  const { campaigns } = await campaignsView(env as ApiEnv, network);
  const c = campaigns.find((x) => x.id === id);
  if (!c) return null;
  const rate = BigInt(c.ratePer1k);
  const scale = 10n ** BigInt(c.decimals);
  const fmt = (u: bigint) => (Number((u * 100n) / scale) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const terms = `Earn ${fmt(rate)} ${sym} per 1,000 views, up to ${fmt(BigInt(c.capPerCreator))} ${sym}.`;
  return {
    // Most titles already lead with the brand ("Kitebase — …").
    title: c.title.toLowerCase().startsWith(brandNameOf(c).toLowerCase())
      ? `${c.title} · ClipPay`
      : `${c.title} — ${brandNameOf(c)} on ClipPay`,
    description: c.brief?.summary ? `${c.brief.summary} ${terms}` : `${terms} Paid out on Stellar as views are verified.`,
    image: `/api/og/c/${c.id}.png`,
  };
}

export async function handleApi(req: Request, env: ApiEnv, path: string): Promise<Response | null> {
  const network = env.NETWORK ?? "testnet";
  const d = deployment(network);
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  const m = (re: RegExp) => path.match(re);
  const sessions = () => {
    if (!env.SESSION_SECRET) throw new Error("sign-in isn't configured on this server");
    return createSessions(
      {
        rpcUrl: d.rpcUrl,
        networkPassphrase: d.networkPassphrase,
        tokenId: d.token.id,
        simulationSource: d.sponsor,
        secret: env.SESSION_SECRET,
      },
      env.DB,
    );
  };

  try {
    if (req.method === "GET" && path === "/api/stats") {
      const { campaigns } = await campaignsView(env, network);
      const sum = (f: (c: Campaign) => string) => campaigns.reduce((n, c) => n + BigInt(f(c)), 0n).toString();
      const stats: Stats = {
        campaigns: campaigns.length,
        liveCampaigns: campaigns.filter((c) => c.status === "live" || c.status === "ending").length,
        locked: sum((c) => (c.refunded ? "0" : c.remaining)),
        paid: sum((c) => c.paid),
        fees: sum((c) => c.fees),
        views: sum((c) => c.views),
        creators: campaigns.reduce((n, c) => n + c.creators, 0),
        token: { symbol: d.token.symbol, decimals: d.token.decimals },
        updatedAt: Math.floor(Date.now() / 1000),
      };
      return json(stats, 200, { "Cache-Control": "public, max-age=10" });
    }

    const og = m(/^\/api\/og\/c\/(\d+)\.png$/);
    if (req.method === "GET" && og) {
      const { campaigns } = await campaignsView(env, network);
      const c = campaigns.find((x) => x.id === Number(og[1]));
      if (!c) return new Response("Not found", { status: 404 });
      const png = await campaignOgPng(c, {
        brandName: brandNameOf(c),
        symbol: d.token.symbol,
        host: new URL(req.url).host,
        logo: await brandLogo(env.DB, c),
      });
      return new Response(png as Uint8Array<ArrayBuffer>, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=600" },
      });
    }

    if (req.method === "GET" && path === "/api/campaigns") {
      const { campaigns } = await campaignsView(env, network);
      return json(campaigns.reverse(), 200, { "Cache-Control": "public, max-age=10" });
    }

    const daily = m(/^\/api\/campaigns\/(\d+)\/daily$/);
    if (req.method === "GET" && daily) {
      // Each settlement records a creator's running view count; a day's new
      // views are the growth of each creator's count over the previous day.
      const bucket = new URL(req.url).searchParams.get("by") === "hour" ? "%Y-%m-%dT%H:00Z" : "%Y-%m-%d";
      const { results } = await env.DB.prepare(
        `SELECT strftime('${bucket}', ts, 'unixepoch') AS day, address, MAX(CAST(views AS INTEGER)) AS views,
                SUM(CAST(amount AS INTEGER)) AS paid, SUM(CAST(fee AS INTEGER)) AS fees
         FROM events WHERE campaign = ? AND type = 'settled' GROUP BY day, address ORDER BY day`,
      )
        .bind(Number(daily[1]))
        .all<{ day: string; address: string; views: number; paid: number; fees: number }>();
      const last = new Map<string, number>();
      const days = new Map<string, { day: string; paid: bigint; fees: bigint; views: number }>();
      for (const r of results) {
        const d = days.get(r.day) ?? { day: r.day, paid: 0n, fees: 0n, views: 0 };
        d.paid += BigInt(r.paid);
        d.fees += BigInt(r.fees);
        d.views += Math.max(0, r.views - (last.get(r.address) ?? 0));
        last.set(r.address, r.views);
        days.set(r.day, d);
      }
      return json([...days.values()], 200, { "Cache-Control": "public, max-age=60" });
    }

    let r = m(/^\/api\/campaigns\/(\d+)$/);
    if (req.method === "GET" && r) {
      const id = Number(r[1]);
      const fresh = new URL(req.url).searchParams.has("fresh");
      const { snap, campaigns, people } = await campaignsView(env, network, fresh);
      const c = campaigns.find((x) => x.id === id);
      if (!c) return fail(404, "Campaign not found");
      const checks = await postChecks(env, id);
      const detail: CampaignDetail = {
        ...c,
        submissions: (snap.submissions.get(id) ?? []).map((s) =>
          toSubmission(id, s, people.get(s.creator) ?? null, checks[s.creator] ?? null),
        ),
        events: await events(env.DB, "WHERE campaign = ?", [id], 50),
        checkEvery: 60,
      };
      return json(detail);
    }

    r = m(/^\/api\/accounts\/([A-Z0-9]{56})$/);
    if (req.method === "GET" && r) {
      const address = r[1]!;
      if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address)) {
        return fail(400, "Not a Stellar address");
      }
      const { snap, campaigns, people } = await campaignsView(env, network);
      const byId = new Map(campaigns.map((c) => [c.id, c]));
      const mine = campaigns.filter((c) => c.brand === address);
      const posts: Account["submissions"] = [];
      for (const [id, subs] of snap.submissions) {
        const s = subs.find((x) => x.creator === address);
        if (!s) continue;
        const c = byId.get(id)!;
        const checks = await postChecks(env, id);
        posts.push({
          ...toSubmission(id, s, people.get(address) ?? null, checks[address] ?? null),
          campaignTitle: c.title,
          campaignStatus: c.status,
          brand: c.brand,
          brandProfile: c.brandProfile,
          brief: c.brief,
        });
      }
      posts.sort((a, b) => b.submittedAt - a.submittedAt);
      const myIds = mine.map((c) => c.id);
      const history = await events(
        env.DB,
        myIds.length ? `WHERE address = ? OR campaign IN (${myIds.map(() => "?").join(",")})` : "WHERE address = ?",
        [address, ...myIds],
        100,
      );
      const monthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) / 1000;
      const { results: month } = await env.DB.prepare(
        "SELECT amount FROM events WHERE type = 'settled' AND address = ? AND ts >= ?",
      )
        .bind(address, monthStart)
        .all<{ amount: string }>();
      const earnedThisMonth = month.reduce((n, e) => n + BigInt(e.amount ?? "0"), 0n);
      const now = Date.now() / 1000;
      const sum = (xs: bigint[]) => xs.reduce((n, x) => n + x, 0n).toString();
      const account: Account = {
        address,
        profile: people.get(address) ?? null,
        campaigns: mine.reverse(),
        submissions: posts,
        events: history,
        totals: {
          earned: sum(posts.map((p) => BigInt(p.paid))),
          earnedThisMonth: earnedThisMonth.toString(),
          spent: sum(mine.map((c) => BigInt(c.budget) - BigInt(c.remaining))),
          lockedInCampaigns: sum(mine.filter((c) => !c.refunded).map((c) => BigInt(c.remaining))),
          refundable: sum(mine.filter((c) => !c.refunded && now > c.refundAt).map((c) => BigInt(c.remaining))),
          views: sum(posts.map((p) => BigInt(p.views))),
        },
      };
      return json(account);
    }

    if (req.method === "GET" && path === "/api/events") {
      const q = new URL(req.url).searchParams;
      const limit = Number(q.get("limit") ?? 50);
      const filters: [string, unknown][] = [];
      if (q.has("campaign")) filters.push(["campaign = ?", Number(q.get("campaign"))]);
      if (q.has("address")) filters.push(["address = ?", q.get("address")]);
      if (q.has("type")) filters.push(["type = ?", q.get("type")]);
      const where = filters.map(([w]) => w);
      const binds = filters.map(([, b]) => b);
      const list = await events(env.DB, where.length ? `WHERE ${where.join(" AND ")}` : "", binds, limit);
      const people = await profiles(env.DB, list.flatMap((e) => (e.address ? [e.address] : [])));
      return json(list.map((e) => ({ ...e, profile: (e.address && people.get(e.address)) || null })));
    }

    // -------------------------------------------------------- briefs, media

    r = m(/^\/api\/briefs\/([0-9a-f]{64})$/);
    if (req.method === "GET" && r) {
      const row = await env.DB.prepare("SELECT json FROM briefs WHERE hash = ?").bind(r[1]).first<{ json: string }>();
      if (!row) return fail(404, "Brief not found");
      return new Response(row.json, {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }

    if (req.method === "POST" && path === "/api/briefs") {
      if (!writeLimit.take(ip)) return fail(429, "Too many uploads — try again in a minute");
      const text = await req.text();
      if (text.length > 32_000) return fail(413, "Brief is too large");
      let brief: Brief;
      try {
        brief = validateBrief(JSON.parse(text));
      } catch (e) {
        return fail(400, e instanceof Error ? e.message : "Invalid brief");
      }
      if (brief.brand.logo) {
        const logo = await env.DB.prepare("SELECT 1 FROM media WHERE hash = ?").bind(brief.brand.logo).first();
        if (!logo) return fail(400, "Upload the logo first");
      }
      const hash = await briefHash(brief);
      await env.DB.prepare("INSERT OR IGNORE INTO briefs (hash, json, created) VALUES (?, ?, ?)")
        .bind(hash, canonicalJson(brief), Math.floor(Date.now() / 1000))
        .run();
      return json({ hash, brief }, 201);
    }

    r = m(/^\/api\/media\/([0-9a-f]{64})$/);
    if (req.method === "GET" && r) {
      const row = await env.DB.prepare("SELECT mime, body FROM media WHERE hash = ?")
        .bind(r[1])
        .first<{ mime: string; body: number[] | ArrayBuffer }>();
      if (!row) return new Response("Not found", { status: 404 });
      // D1 returns BLOB columns as arrays of byte values.
      let body = new Uint8Array(row.body);
      let mime = row.mime;
      const w = Number(new URL(req.url).searchParams.get("w"));
      if (THUMB_SIZES.includes(w)) {
        const thumb = await thumbnailPng({ hash: r[1]!, mime, body }, w).catch(() => null);
        if (thumb && thumb.length < body.length) [body, mime] = [new Uint8Array(thumb), "image/png"];
      }
      return new Response(body, {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }

    if (req.method === "POST" && path === "/api/media") {
      if (!writeLimit.take(ip)) return fail(429, "Too many uploads — try again in a minute");
      const mime = (req.headers.get("Content-Type") ?? "").split(";")[0]!.trim();
      const check = MEDIA_TYPES[mime];
      if (!check) return fail(415, "Use a PNG, JPEG or WebP image");
      const body = new Uint8Array(await req.arrayBuffer());
      if (body.length > MEDIA_MAX) return fail(413, "Image must be 256 KB or smaller");
      if (!check(body)) return fail(415, "That file isn't the image type it claims to be");
      const hash = await sha256Hex(body);
      await env.DB.prepare("INSERT OR IGNORE INTO media (hash, mime, body, created) VALUES (?, ?, ?, ?)")
        .bind(hash, mime, body, Math.floor(Date.now() / 1000))
        .run();
      return json({ hash, url: `/api/media/${hash}` }, 201);
    }

    // ---------------------------------------------------------- sign-in

    if (req.method === "GET" && path === "/api/auth/challenge") {
      if (!authLimit.take(ip)) return fail(429, "Too many sign-in attempts — try again in a minute");
      const address = new URL(req.url).searchParams.get("address") ?? "";
      if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address)) {
        return fail(400, "Not a Stellar address");
      }
      return json(await sessions().challenge(address));
    }

    if (req.method === "POST" && path === "/api/auth/verify") {
      if (!authLimit.take(ip)) return fail(429, "Too many sign-in attempts — try again in a minute");
      const body = (await req.json().catch(() => ({}))) as { id?: string; entry?: string };
      if (typeof body.id !== "string" || typeof body.entry !== "string") return fail(400, "Expected { id, entry }");
      try {
        return json(await sessions().verify(body.id, body.entry));
      } catch (e) {
        return fail(401, e instanceof Error ? e.message : "Sign-in failed");
      }
    }

    if (path === "/api/me" || path === "/api/profile" || /^\/api\/campaigns\/\d+\/brief$/.test(path)) {
      const who = await sessions().account(req);
      if (!who) return fail(401, "Sign in again to continue");

      if (req.method === "GET" && path === "/api/me") {
        const p = (await profiles(env.DB, [who])).get(who) ?? null;
        return json({ address: who, profile: p });
      }

      if (req.method === "PUT" && path === "/api/profile") {
        const body = (await req.json().catch(() => ({}))) as { name?: unknown; avatar?: unknown; bio?: unknown };
        const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) || null : null;
        const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 160) || null : null;
        const avatar = typeof body.avatar === "string" && /^[0-9a-f]{64}$/.test(body.avatar) ? body.avatar : null;
        if (avatar && !(await env.DB.prepare("SELECT 1 FROM media WHERE hash = ?").bind(avatar).first())) {
          return fail(400, "Upload the image first");
        }
        await env.DB.prepare(
          `INSERT INTO profiles (address, name, avatar, bio, updated) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (address) DO UPDATE SET name = excluded.name, avatar = excluded.avatar,
             bio = excluded.bio, updated = excluded.updated`,
        )
          .bind(who, name, avatar, bio, Math.floor(Date.now() / 1000))
          .run();
        return json((await profiles(env.DB, [who])).get(who));
      }

      r = m(/^\/api\/campaigns\/(\d+)\/brief$/);
      if (req.method === "PUT" && r) {
        const id = Number(r[1]);
        const snap = await readChain(network);
        const c = snap.campaigns.find((x) => x.id === id);
        if (!c) return fail(404, "Campaign not found");
        if (c.brand !== who) return fail(403, "Only the campaign's brand can edit it");
        if (hashFromBriefUrl(c.brief_url)) return fail(409, "This campaign's brief is pinned on-chain");
        const body = (await req.json().catch(() => ({}))) as { hash?: unknown };
        if (typeof body.hash !== "string" || !/^[0-9a-f]{64}$/.test(body.hash)) return fail(400, "Expected { hash }");
        if (!(await env.DB.prepare("SELECT 1 FROM briefs WHERE hash = ?").bind(body.hash).first())) {
          return fail(400, "Upload the brief first");
        }
        await env.DB.prepare(
          `INSERT INTO campaign_meta (campaign, brief, set_by, updated) VALUES (?, ?, ?, ?)
           ON CONFLICT (campaign) DO UPDATE SET brief = excluded.brief, set_by = excluded.set_by,
             updated = excluded.updated`,
        )
          .bind(id, body.hash, who, Math.floor(Date.now() / 1000))
          .run();
        return json({ campaign: id, brief: body.hash });
      }
    }
  } catch (e) {
    console.error(`[api] ${path}`, e);
    return fail(502, "The network didn't respond — try again shortly");
  }
  return null;
}
