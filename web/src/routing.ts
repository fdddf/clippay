// Which HTML entry serves a path. Shared by the Vite dev server
// (vite.config.ts) and the Cloudflare Worker (verifier/src/worker.ts).
//
// - landing: prerendered marketing pages (no blockchain code)
// - app:     the application; it also renders the not-found page
export type Entry = "landing" | "app";

/** Prerendered pages; each is emitted as `<name>.html` by scripts/prerender.ts. */
export const LANDING_PAGES: Record<string, string> = {
  "/": "index",
  "/how-it-works": "how-it-works",
  "/security": "security",
  "/terms": "terms",
  "/privacy": "privacy",
};

/** Path prefixes the app has routes for. Other paths get its not-found page. */
export const APP_PREFIXES: string[] = ["/_ui", "/campaigns", "/c", "/b", "/new", "/dashboard"];

/** "/security/" → "/security"; "/" stays "/". */
const normalize = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") || "/" : path);

export function entryFor(path: string): Entry {
  return normalize(path) in LANDING_PAGES ? "landing" : "app";
}

/** Whether a path is one of the app's routes (anything else is a 404). */
export function isAppRoute(path: string): boolean {
  const p = normalize(path);
  return APP_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

export const ENTRY_HTML: Record<Entry, string> = {
  landing: "/index.html",
  app: "/app.html",
};

/** The built HTML file that serves a path (the Worker's view of the routes above). */
export function htmlFor(path: string): string {
  const p = normalize(path);
  const entry = entryFor(p);
  return entry === "landing" ? `/${LANDING_PAGES[p]}.html` : ENTRY_HTML[entry];
}
