// Fixed-window rate limiter keyed by caller (IP, wallet…). In-memory: each
// verifier instance limits on its own.
export function rateLimiter(perMinute: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    /** Counts one request for `key`; false once the key is over its limit. */
    take(key: string, now = Date.now()): boolean {
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (now - w.start >= 60_000) windows.delete(k);
      }
      const w = windows.get(key);
      if (!w || now - w.start >= 60_000) {
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      w.count++;
      return w.count <= perMinute;
    },
  };
}
