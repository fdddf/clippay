// Rules a post must pass before it is paid. A failing rule puts the post on
// hold: nothing is settled until the post is fixed (ownership tag, #ad) or a
// reviewer approves it (anti-fraud flags, old or already-entered posts).
import type { Submission } from "@clippay/pool-client";
import { ownershipTag, type PostStats } from "./views.ts";

export interface Rules {
  /** Description must contain `clippay:<first 16 chars of the creator>`. */
  requireOwnershipTag: boolean;
  /** Title or description must disclose the sponsorship (#ad, #sponsored…). */
  requireAdDisclosure: boolean;
  /** Flag growth faster than this many views per hour since the last check. */
  maxViewsPerHour: number;
  /** Flag posts over `minViewsForEngagement` with fewer likes per view than this. */
  minLikeRatio: number;
  minViewsForEngagement: number;
  /** Flag channels younger than this many days. */
  minChannelAgeDays: number;
  /**
   * Flag posts published before the campaign started: views are paid from
   * zero, so an old post would be paid for views it earned elsewhere.
   */
  requireNewPost: boolean;
}

/** When the campaign started, as far as the verifier knows. */
export interface Start {
  /** Unix seconds. */
  at: number;
  /** False when `at` is only an upper bound (the campaign's first entry). */
  exact: boolean;
}

export interface Hold {
  /** Fixable by the creator: the post is re-checked on every pass. */
  fixable: string[];
  /** Needs a reviewer: the post stays on hold until approved. */
  review: string[];
}

export interface Previous {
  views: bigint;
  /** Unix seconds. */
  at: number;
}

const DISCLOSURE = /#(ad|ads|sponsored|partner|paidpartnership)\b/i;

/** Whether the post proves it is `sub.creator`'s (or the rule doesn't apply). */
export function showsTag(sub: Submission, stats: Omit<PostStats, "views">, rules: Rules): boolean {
  const hasText = stats.title !== undefined || stats.description !== undefined;
  return !rules.requireOwnershipTag || !hasText || !!stats.description?.includes(ownershipTag(sub.creator));
}

export function check(
  sub: Submission,
  stats: PostStats,
  prev: Previous | undefined,
  rules: Rules,
  now = Date.now() / 1000,
  start?: Start,
): Hold {
  const hold: Hold = { fixable: [], review: [] };
  const text = `${stats.title ?? ""}\n${stats.description ?? ""}`;
  const hasText = stats.title !== undefined || stats.description !== undefined;

  if (!showsTag(sub, stats, rules)) {
    hold.fixable.push(`Add "${ownershipTag(sub.creator)}" to the post description`);
  }
  if (rules.requireAdDisclosure && hasText && !DISCLOSURE.test(text)) {
    hold.fixable.push("Disclose the sponsorship with #ad or #sponsored");
  }

  if (prev && now > prev.at && stats.views > prev.views) {
    const perHour = Number(stats.views - prev.views) / ((now - prev.at) / 3600);
    if (perHour > rules.maxViewsPerHour) {
      hold.review.push(`Views jumped by ${Math.round(perHour).toLocaleString("en-US")}/hour`);
    }
  }
  if (stats.likes !== undefined && stats.views >= BigInt(rules.minViewsForEngagement)) {
    const ratio = Number(stats.likes) / Number(stats.views);
    if (ratio < rules.minLikeRatio) {
      hold.review.push(`Unusually low engagement (${(ratio * 100).toFixed(2)}% likes per view)`);
    }
  }
  if (stats.channelCreatedAt !== undefined) {
    const days = (now - stats.channelCreatedAt) / 86400;
    if (days < rules.minChannelAgeDays) {
      hold.review.push(`Channel is only ${Math.floor(days)} day(s) old`);
    }
  }
  if (rules.requireNewPost && start && stats.publishedAt !== undefined && stats.publishedAt < start.at) {
    const day = new Date(stats.publishedAt * 1000).toISOString().slice(0, 10);
    hold.review.push(
      start.exact
        ? `Published ${day}, before the campaign started`
        : `Published ${day}, before the campaign's first entry: may predate the campaign`,
    );
  }
  return hold;
}

/**
 * One post, one payee per campaign: the first creator whose tag is on the post
 * owns it (or whoever was already paid for it). Records the owner in `owners`
 * and returns a review flag for anyone else who entered the same post.
 */
export function claimPost(
  owners: Map<string, string>,
  post: string,
  creator: string,
  tagged: boolean,
): string | undefined {
  const owner = owners.get(post);
  if (owner === undefined) {
    if (tagged) owners.set(post, creator);
    return;
  }
  if (owner !== creator) return `Another creator already entered this post (${owner.slice(0, 6)}…${owner.slice(-4)})`;
}
