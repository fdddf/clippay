import type { Campaign } from "@clippay/pool-client";

export function nowSecs(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export function timeLeft(until: bigint): string {
  const s = Number(until - nowSecs());
  if (s <= 0) return "ended";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(m, 1)}m left`;
}

export function status(c: Campaign): { label: string; tone: string; detail: string } {
  if (c.refunded) return { label: "Closed", tone: "muted", detail: "refunded" };
  if (c.remaining === 0n) return { label: "Budget spent", tone: "muted", detail: "fully paid out" };
  if (nowSecs() > c.deadline) return { label: "Settling", tone: "warn", detail: "submissions closed" };
  return { label: "Live", tone: "ok", detail: timeLeft(c.deadline) };
}

/** Effective price paid per 1,000 verified views, e.g. "0.50" (token units). */
export function costPer1k(spent: bigint, views: bigint, decimals = 7): string {
  if (views === 0n) return "—";
  const per1k = Number(spent) / 10 ** decimals / (Number(views) / 1000);
  return `${per1k.toFixed(2)}`;
}
