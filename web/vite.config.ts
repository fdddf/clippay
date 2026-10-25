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
          req.url = ENTRY_HTML[entryFor(url.pathname)];
        }
        next();
      });
      // Prerendered markup has no HMR: when a file the landing pages render
      // from changes, re-render them and reload.
      server.watcher.on("change", (file) => {
        const ssr = server.environments.ssr.moduleGraph;
        if (!ssr.getModulesByFile(file)?.size) return;
        ssr.invalidateAll();
        server.ws.send({ type: "full-reload" });
      });
    },
    // Landing pages: render the requested path into index.html, as
    // scripts/prerender.ts does at build time. `originalUrl` is the path
    // before the rewrite above.
    async transformIndexHtml(html, ctx) {
      if (!ctx.server || !html.includes("<!--app-->")) return html;
      const path = new URL(ctx.originalUrl ?? "/", "http://localhost").pathname.replace(/(.)\/+$/, "$1");
      const { render } = await ctx.server.ssrLoadModule("/src/landing/entry-server.tsx");
      const page = render(path in LANDING_PAGES ? path : "/");
      return html.replace("<!--head-->", page.head).replace("<!--app-->", page.html);
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
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        app: fileURLToPath(new URL("./app.html", import.meta.url)),
        legacy: fileURLToPath(new URL("./legacy.html", import.meta.url)),
      },
    },
  },
});
