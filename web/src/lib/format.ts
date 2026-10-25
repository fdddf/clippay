// Display formatting shared by the landing page and the app.

/** `GABC…WXYZ` */
export function shortAddress(addr: string, chars = 4): string {
  return addr.length > chars * 2 + 1 ? `${addr.slice(0, chars)}…${addr.slice(-chars)}` : addr;
}

/**
 * Token units → "1,234.50": at least `minFrac` and at most `maxFrac`
 * decimals (truncated, never rounded up), trailing zeros beyond `minFrac` dropped.
 */
export function formatUnits(units: bigint, decimals = 7, maxFrac = 2, minFrac = Math.min(2, maxFrac)): string {
  const scale = 10n ** BigInt(decimals);
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = (abs / scale).toLocaleString("en-US");
  let frac = (abs % scale).toString().padStart(decimals, "0").slice(0, maxFrac);
  while (frac.length > minFrac && frac.endsWith("0")) frac = frac.slice(0, -1);
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/**
 * "12.5" → token units (bigint), or null if it isn't a positive amount with
 * at most `decimals` decimal places.
 */
export function parseUnits(text: string, decimals = 7): bigint | null {
  const m = text.trim().replace(/,/g, "").match(/^(\d*)(?:\.(\d*))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const frac = m[2] ?? "";
  if (frac.length > decimals) return null;
  return BigInt(m[1] || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** 12,400 → "12.4K"; below 10,000 stays exact. */
export function compactNumber(n: number | bigint): string {
  const v = Number(n);
  if (Math.abs(v) < 10_000) return v.toLocaleString("en-US");
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

/** Seconds until `unix` → "5d 3h", "4h 12m", "8m", or null when past. */
export function timeLeft(unix: number, now = Date.now() / 1000): string | null {
  const s = Math.floor(unix - now);
  if (s <= 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

/** "just now", "5 min ago", "3 h ago", "Oct 24". */
export function relativeTime(unix: number, now = Date.now() / 1000): string {
  const s = Math.floor(now - unix);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Stable 32-bit hash (FNV-1a), for colours and placeholder art. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * An uploaded image (`/api/media/<hash>`) at a thumbnail size: 64 px for avatars
 * up to 32 CSS px, 128 px for larger ones (2× for high-density screens).
 * Other URLs are returned as they are.
 */
export function mediaThumb<T extends string | null | undefined>(src: T, cssPx: number): T {
  if (!src || !/\/media\/[0-9a-f]{64}$/.test(src)) return src;
  return `${src}?w=${cssPx <= 32 ? 64 : 128}` as T;
}

/** "1 post", "3 posts". */
export const plural = (n: number | bigint, word: string) => `${n} ${n == 1 ? word : `${word}s`}`;
