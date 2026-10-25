// The create-campaign wizard's form: defaults, per-step validation, the
// derived numbers, and a draft kept in this browser between visits.
import type { Campaign } from "@/lib/api-types";
import { LIMITS, type Brief, type Category, type Platform } from "@/lib/brief";
import { parseUnits } from "@/lib/format";
import { config } from "@/lib/network";

export interface Draft {
  title: string;
  brandName: string;
  /** Media hash of the uploaded logo. */
  logo: string | null;
  website: string;
  platform: Platform;
  category: Category;
  summary: string;
  body: string;
  rules: string[];
  exampleUrl: string;
  budget: string;
  rate: string;
  cap: string;
  /** Days from launch, or "custom" for `endDate`. */
  duration: "1" | "7" | "14" | "30" | "custom";
  /** yyyy-mm-dd, local time; the campaign ends at 23:59 that day. */
  endDate: string;
}

export const DEFAULT_DRAFT: Draft = {
  title: "",
  brandName: "",
  logo: null,
  website: "",
  platform: "youtube",
  category: "apps",
  summary: "",
  body: "",
  rules: [],
  exampleUrl: "",
  budget: "200",
  rate: "1",
  cap: "25",
  duration: "7",
  endDate: "",
};

export const TITLE_MAX = 80;
export const DISCLOSURE_RULE = "Disclose the sponsorship with #ad";

const KEY = "clippay.draft";

export function loadDraft(): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Draft> | null;
    return saved ? { ...DEFAULT_DRAFT, ...saved } : DEFAULT_DRAFT;
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function saveDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch {}
}

export type Errors = Partial<Record<keyof Draft | `rules.${number}`, string>>;

function isUrl(s: string): boolean {
  try {
    return /^https?:$/.test(new URL(s).protocol);
  } catch {
    return false;
  }
}

export function briefErrors(d: Draft): Errors {
  const e: Errors = {};
  const title = d.title.trim();
  if (title.length < 3) e.title = "Give the campaign a title (at least 3 characters)";
  else if (title.length > TITLE_MAX) e.title = `Keep the title under ${TITLE_MAX} characters`;
  if (!d.brandName.trim()) e.brandName = "Add your brand name";
  else if (d.brandName.trim().length > LIMITS.name) e.brandName = `At most ${LIMITS.name} characters`;
  if (d.website.trim() && !isUrl(d.website.trim())) e.website = "Enter a full link, starting with https://";
  if (!d.summary.trim()) e.summary = "Say in a sentence what you want creators to make";
  else if (d.summary.trim().length > LIMITS.summary) e.summary = `At most ${LIMITS.summary} characters`;
  if (d.body.trim().length < 40) e.body = "Describe what to make and what to include (at least 40 characters)";
  else if (d.body.length > LIMITS.body) e.body = `At most ${LIMITS.body.toLocaleString("en-US")} characters`;
  d.rules.forEach((r, i) => {
    if (!r.trim()) e[`rules.${i}`] = "Write the rule or remove it";
    else if (r.trim().length > LIMITS.rule) e[`rules.${i}`] = `At most ${LIMITS.rule} characters`;
  });
  if (d.exampleUrl.trim() && !isUrl(d.exampleUrl.trim())) e.exampleUrl = "Enter a full link, starting with https://";
  return e;
}

/** When the campaign ends (unix seconds), from the duration choice. */
export function deadlineOf(d: Draft, now = Date.now() / 1000): number | null {
  if (d.duration !== "custom") return Math.floor(now + Number(d.duration) * 86_400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.endDate)) return null;
  const [y, m, day] = d.endDate.split("-").map(Number);
  return Math.floor(new Date(y!, m! - 1, day!, 23, 59).getTime() / 1000);
}

export interface Amounts {
  budget: bigint;
  rate: bigint;
  cap: bigint;
  deadline: number;
}

export function budgetErrors(d: Draft, balance: bigint | null): { errors: Errors; amounts: Amounts | null } {
  const e: Errors = {};
  const dec = config.tokenDecimals;
  const budget = parseUnits(d.budget, dec);
  const rate = parseUnits(d.rate, dec);
  const cap = parseUnits(d.cap, dec);
  if (!budget) e.budget = "Enter a budget above zero";
  else if (balance !== null && budget > balance) e.budget = "More than your wallet holds";
  if (!rate) e.rate = "Enter a rate above zero";
  if (!cap) e.cap = "Enter a maximum above zero";
  else if (budget && cap > budget) e.cap = "Can't be more than the whole budget";
  const deadline = deadlineOf(d);
  if (deadline === null) e.endDate = "Pick an end date";
  else if (deadline < Date.now() / 1000 + 3600) e.endDate = "Pick a date at least an hour from now";
  return { errors: e, amounts: budget && rate && cap && deadline && !Object.keys(e).length ? { budget, rate, cap, deadline } : null };
}

export function toBrief(d: Draft): Brief {
  return {
    v: 1,
    brand: { name: d.brandName.trim(), logo: d.logo, website: d.website.trim() || null },
    platform: d.platform,
    category: d.category,
    summary: d.summary.trim(),
    body: d.body.trim(),
    rules: [DISCLOSURE_RULE, ...d.rules.map((r) => r.trim()).filter(Boolean)],
    exampleUrl: d.exampleUrl.trim() || null,
  };
}

/** The campaign as the marketplace would show it, for the live preview. */
export function previewCampaign(d: Draft, brand: string): Campaign {
  const dec = config.tokenDecimals;
  const budget = parseUnits(d.budget, dec) ?? 0n;
  const deadline = deadlineOf(d) ?? Math.floor(Date.now() / 1000 + 7 * 86_400);
  return {
    id: 0,
    brand,
    token: config.tokenId,
    decimals: dec,
    title: d.title.trim() || "Your campaign title",
    briefUrl: "",
    budget: budget.toString(),
    remaining: budget.toString(),
    ratePer1k: (parseUnits(d.rate, dec) ?? 0n).toString(),
    capPerCreator: (parseUnits(d.cap, dec) ?? 0n).toString(),
    deadline,
    refundAt: deadline + config.settleGrace,
    refunded: false,
    feeBps: config.feeBps,
    creators: 0,
    paid: "0",
    fees: "0",
    views: "0",
    status: deadline - Date.now() / 1000 < 86_400 ? "ending" : "live",
    brief: { ...toBrief(d), brand: { name: d.brandName.trim() || "Your brand", logo: d.logo, website: null } },
    briefSource: "hash",
    briefHash: null,
    brandProfile: null,
  };
}
