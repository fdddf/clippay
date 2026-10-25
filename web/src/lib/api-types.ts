// JSON shapes served by the Worker's /api (verifier/src/api.ts) and read by the
// web app. Token amounts are decimal strings of base units (i128 on-chain).
import type { Brief } from "./brief.ts";

export interface Profile {
  address: string;
  name: string | null;
  /** URL of the avatar image, or null for the generated one. */
  avatar: string | null;
  bio: string | null;
}

export type CampaignStatus = "live" | "ending" | "settling" | "closed" | "spent";

export interface Campaign {
  id: number;
  brand: string;
  token: string;
  decimals: number;
  title: string;
  briefUrl: string;
  budget: string;
  remaining: string;
  ratePer1k: string;
  capPerCreator: string;
  /** Unix seconds. */
  deadline: number;
  /** When the brand can refund (deadline + settlement grace). */
  refundAt: number;
  refunded: boolean;
  feeBps: number;
  creators: number;
  /** Paid to creators (after fees). */
  paid: string;
  fees: string;
  views: string;
  status: CampaignStatus;
  brief: Brief | null;
  /** hash: pinned by the on-chain brief URL · attached: added later by the brand · external: a link only */
  briefSource: "hash" | "attached" | "external";
  briefHash: string | null;
  brandProfile: Profile | null;
}

/** What the verifier last concluded about a post. */
export interface PostCheck {
  views: string;
  checkedAt: number;
  fixable: string[];
  review: string[];
  decision?: "approved" | "rejected";
  error?: string;
}

export interface Submission {
  campaign: number;
  creator: string;
  url: string;
  submittedAt: number;
  views: string;
  paid: string;
  fee: string;
  profile: Profile | null;
  check: PostCheck | null;
}

export interface CampaignDetail extends Campaign {
  submissions: Submission[];
  events: ChainEvent[];
  /** Seconds between automatic view checks. */
  checkEvery: number;
}

export interface ChainEvent {
  id: string;
  ledger: number;
  ts: number;
  tx: string;
  type: string;
  campaign: number | null;
  address: string | null;
  amount: string | null;
  fee: string | null;
  views: string | null;
  /** The address's profile; only on /api/events. */
  profile?: Profile | null;
}

export interface Stats {
  campaigns: number;
  liveCampaigns: number;
  locked: string;
  paid: string;
  fees: string;
  views: string;
  creators: number;
  /** Symbol and decimals of the payout token. */
  token: { symbol: string; decimals: number };
  updatedAt: number;
}

export interface Account {
  address: string;
  profile: Profile | null;
  /** Campaigns this account created. */
  campaigns: Campaign[];
  /** This account's posts, newest first. */
  submissions: (Submission & { campaignTitle: string; campaignStatus: CampaignStatus; brandProfile: Profile | null; brand: string; brief: Brief | null })[];
  /** Payouts, refunds and other events involving this account, newest first. */
  events: ChainEvent[];
  totals: {
    earned: string;
    earnedThisMonth: string;
    spent: string;
    lockedInCampaigns: string;
    refundable: string;
    views: string;
  };
}

export interface ApiError {
  error: string;
}
