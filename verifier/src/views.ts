// View-count providers. Each returns what it knows about a submission's post,
// or throws if the post can't be found.
import type { Submission } from "@clippay/pool-client";

export interface PostStats {
  /** Cumulative views. */
  views: bigint;
  likes?: bigint;
  title?: string;
  description?: string;
  /** Unix seconds. */
  publishedAt?: number;
  /** Unix seconds; when the channel that posted it was created. */
  channelCreatedAt?: number;
}

export interface ViewProvider {
  name: string;
  /** Whether stats carry the metadata (title, description…) checks need. */
  hasMetadata: boolean;
  stats(sub: Submission): Promise<PostStats>;
}

/**
 * Demo provider. Like a real post, views start at `viewsPerSecond` and level
 * off: each post has its own ceiling (8k–80k, derived from its URL), reached
 * along `ceiling × (1 − e^(−t/τ))` with τ = ceiling / viewsPerSecond.
 */
export function mockProvider(viewsPerSecond: number): ViewProvider {
  return {
    name: "mock",
    hasMetadata: false,
    async stats(sub) {
      const elapsed = Date.now() / 1000 - Number(sub.submitted_at);
      if (elapsed <= 0) return { views: 0n };
      const ceiling = 8_000 + (hash(sub.url) % 72_000);
      const views = ceiling * (1 - Math.exp((-elapsed * viewsPerSecond) / ceiling));
      return { views: BigInt(Math.floor(views)) };
    },
  };
}

/** FNV-1a, for a stable per-post number. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

interface YouTubeItem {
  statistics?: { viewCount?: string; likeCount?: string };
  snippet?: { title?: string; description?: string; publishedAt?: string; channelId?: string };
}

/**
 * YouTube Data API v3. Costs 1 quota unit per video, plus 1 per channel the
 * first time it is seen (channel ages are cached).
 */
export function youtubeProvider(apiKey: string): ViewProvider {
  const channelCreated = new Map<string, number>();

  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (res.status === 403) throw new Error("YouTube API quota exceeded — will retry next pass");
    if (!res.ok) throw new Error(`YouTube API ${res.status}`);
    return res.json() as Promise<T>;
  }

  async function channelAge(id: string): Promise<number | undefined> {
    if (!channelCreated.has(id)) {
      const body = await get<{ items?: { snippet?: { publishedAt?: string } }[] }>("channels", {
        part: "snippet",
        id,
      });
      const at = body.items?.[0]?.snippet?.publishedAt;
      if (at) channelCreated.set(id, Date.parse(at) / 1000);
    }
    return channelCreated.get(id);
  }

  return {
    name: "youtube",
    hasMetadata: true,
    async stats(sub) {
      const id = youtubeId(sub.url);
      if (!id) throw new Error(`not a YouTube URL: ${sub.url}`);
      const body = await get<{ items?: YouTubeItem[] }>("videos", {
        part: "statistics,snippet",
        id,
      });
      const item = body.items?.[0];
      if (!item) throw new Error(`video ${id} not found`);
      const s = item.snippet ?? {};
      return {
        views: BigInt(item.statistics?.viewCount ?? "0"),
        likes: item.statistics?.likeCount ? BigInt(item.statistics.likeCount) : undefined,
        title: s.title,
        description: s.description,
        publishedAt: s.publishedAt ? Date.parse(s.publishedAt) / 1000 : undefined,
        channelCreatedAt: s.channelId ? await channelAge(s.channelId) : undefined,
      };
    },
  };
}

export { ownershipTag } from "../../web/src/lib/brief.ts";

/**
 * The post a URL points at, so differently written links to one post compare
 * equal: `youtube:<video id>` for YouTube, else host and path without query,
 * fragment, `www.`/`m.` or a trailing slash.
 */
export function postKey(raw: string): string {
  const id = youtubeId(raw);
  if (id) return `youtube:${id}`;
  try {
    const u = new URL(raw.trim());
    return `${u.hostname.replace(/^(www|m)\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return raw.trim();
  }
}

export function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}
