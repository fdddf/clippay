// Campaign-page helpers shared by its cards.
import { useEffect, useState } from "react";
import type { Campaign, PostCheck } from "@/lib/api-types";

/** What a creator receives from `units` of gross earnings, after the platform fee. */
export function net(c: Pick<Campaign, "feeBps">, units: bigint): bigint {
  return units - (units * BigInt(c.feeBps)) / 10_000n;
}

export type Hold =
  | { kind: "ok" }
  | { kind: "fix"; reasons: string[] }
  | { kind: "review"; reasons: string[] }
  | { kind: "rejected" };

/** Why a post isn't being paid, from the verifier's last check. */
export function holdOf(check: PostCheck | null): Hold {
  if (!check) return { kind: "ok" };
  if (check.decision === "rejected") return { kind: "rejected" };
  if (check.fixable.length) return { kind: "fix", reasons: check.fixable };
  if (check.review.length && check.decision !== "approved") return { kind: "review", reasons: check.review };
  return { kind: "ok" };
}

/** The current time in seconds, ticking every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Host and path of a post link, for display: "youtube.com/shorts/abc". */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}
