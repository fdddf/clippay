import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { ENTRY_HTML, LANDING_PAGES, entryFor } from "./src/routing.ts";

const src = fileURLToPath(new URL("./src", import.meta.url));

/** Dev server: route each path to its HTML entry, as the Worker does in production. */
function entryRouting(): Plugin {
  return {
    name: "clippay-entry-routing",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const accept = req.headers.accept ?? "";
        if (req.method === "GET" && accept.includes("text/html") && !url.pathname.includes(".")) {
          const entry = entryFor(url.pathname);
          // Landing pages are their own HTML files in dev too.
          req.url = entry === "landing" ? `/${LANDING_PAGES[url.pathname] ?? "index"}.html` : ENTRY_HTML[entry];
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), entryRouting()],
  resolve: { alias: { "@": src } },
  server: {
    // The API (verifier, relay, index, metadata) runs in `wrangler dev`.
    proxy: { "/api": process.env.API_PROXY ?? "http://localhost:8790" },
  },
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./app.html", import.meta.url)),
        legacy: fileURLToPath(new URL("./legacy.html", import.meta.url)),
      },
    },
  },
});
