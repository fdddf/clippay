// Campaign briefs: what a brand publishes about a campaign. Stored off-chain,
// content-addressed by the SHA-256 of their canonical JSON, so a campaign whose
// on-chain brief URL ends in /b/<hash> can't be changed afterwards.
// Shared by the web app and the Worker.

export const PLATFORMS = ["youtube", "tiktok", "instagram", "any"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube Shorts",
  tiktok: "TikTok",
  instagram: "Instagram Reels",
  any: "Any platform",
};

export const CATEGORIES = ["gaming", "music", "apps", "web3", "lifestyle", "education", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  gaming: "Gaming",
  music: "Music",
  apps: "Apps",
  web3: "Web3",
  lifestyle: "Lifestyle",
  education: "Education",
  other: "Other",
};

export interface Brief {
  v: 1;
  brand: {
    name: string;
    /** Media hash of the logo (served at /api/media/<hash>), or null. */
    logo: string | null;
    website: string | null;
  };
  platform: Platform;
  category: Category;
  /** One or two sentences shown on cards. */
  summary: string;
  /** The full brief, Markdown. */
  body: string;
  /** Must-dos the post is checked against, e.g. "Include #ad". */
  rules: string[];
  /** An example post or the source video to clip. */
  exampleUrl: string | null;
  /** True for fictional demo brands. */
  demo?: boolean;
}

export const LIMITS = { name: 60, summary: 200, body: 8000, rule: 120, rules: 10, url: 300 };
const HASH = /^[0-9a-f]{64}$/;

function str(v: unknown, field: string, max: number, required = true): string | null {
  if (v === null || v === undefined || v === "") {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  if (typeof v !== "string") throw new Error(`${field} must be text`);
  const s = v.trim();
  if (required && !s) throw new Error(`${field} is required`);
  if (s.length > max) throw new Error(`${field} is longer than ${max} characters`);
  return s || null;
}

function url(v: unknown, field: string): string | null {
  const s = str(v, field, LIMITS.url, false);
  if (s === null) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`${field} must be a link`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${field} must be a web link`);
  return u.href;
}

/** Checks and normalises untrusted input; throws a readable error. */
export function validateBrief(input: unknown): Brief {
  if (!input || typeof input !== "object") throw new Error("brief must be an object");
  const b = input as Record<string, unknown>;
  const brand = (b.brand ?? {}) as Record<string, unknown>;
  const logo = brand.logo ?? null;
  if (logo !== null && (typeof logo !== "string" || !HASH.test(logo))) throw new Error("brand.logo must be a media hash");
  if (!PLATFORMS.includes(b.platform as Platform)) throw new Error("platform is not supported");
  if (!CATEGORIES.includes(b.category as Category)) throw new Error("category is not supported");
  const rules = Array.isArray(b.rules) ? b.rules : [];
  if (rules.length > LIMITS.rules) throw new Error(`at most ${LIMITS.rules} rules`);
  return {
    v: 1,
    brand: {
      name: str(brand.name, "brand name", LIMITS.name)!,
      logo: logo as string | null,
      website: url(brand.website, "brand website"),
    },
    platform: b.platform as Platform,
    category: b.category as Category,
    summary: str(b.summary, "summary", LIMITS.summary)!,
    body: str(b.body, "brief", LIMITS.body)!,
    rules: rules.map((r, i) => str(r, `rule ${i + 1}`, LIMITS.rule)!),
    exampleUrl: url(b.exampleUrl, "example link"),
    ...(b.demo === true ? { demo: true } : {}),
  };
}

/** JSON with object keys sorted, so equal briefs always hash the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export async function sha256Hex(data: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function briefHash(b: Brief): Promise<string> {
  return sha256Hex(canonicalJson(b));
}

/** The hash a brief URL pins, if it is a ClipPay brief link (…/b/<hash>). */
export function hashFromBriefUrl(url: string): string | null {
  const m = url.match(/\/b\/([0-9a-f]{64})(?:[/?#]|$)/);
  return m ? m[1]! : null;
}
