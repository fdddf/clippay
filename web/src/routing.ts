// Which HTML entry serves a path. Shared by the Vite dev server
// (vite.config.ts) and the Cloudflare Worker (verifier/src/worker.ts).
//
// - landing: prerendered marketing pages (no blockchain code)
// - app:     the new application (Tailwind + shadcn/ui)
// - legacy:  the original app, serving routes not yet migrated
export type Entry = "landing" | "app" | "legacy";

/** Prerendered pages; each is emitted as `<name>.html` by scripts/prerender.ts. */
export const LANDING_PAGES: Record<string, string> = {};

/** Path prefixes the new app owns. Grows as pages migrate from the legacy app. */
export const APP_PREFIXES: string[] = ["/_ui"];

export function entryFor(path: string): Entry {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (p in LANDING_PAGES) return "landing";
  if (APP_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`))) return "app";
  return "legacy";
}

export const ENTRY_HTML: Record<Entry, string> = {
  landing: "/index.html",
  app: "/app.html",
  legacy: "/legacy.html",
};
