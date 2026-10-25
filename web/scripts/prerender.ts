// Writes each landing page (src/routing.ts LANDING_PAGES) as static HTML into
// dist/, from the built index.html template and the SSR bundle in dist-ssr/.
import { readFileSync, writeFileSync } from "node:fs";
import { LANDING_PAGES } from "../src/routing.ts";

const dist = new URL("../dist/", import.meta.url);
const { render } = (await import(new URL("../dist-ssr/entry-server.js", import.meta.url).href)) as {
  render(path: string): { head: string; html: string };
};
let template = readFileSync(new URL("index.html", dist), "utf8");
if (!template.includes("<!--head-->") || !template.includes("<!--app-->")) {
  throw new Error("dist/index.html lost its <!--head--> / <!--app--> placeholders");
}
// Inline the (small, landing-only) stylesheet: one less round trip before
// the first paint. Its url()s are absolute, so they still resolve.
template = template.replace(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/g, (_m, href: string) => {
  const css = readFileSync(new URL(`.${href}`, dist), "utf8");
  return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
});

for (const [path, name] of Object.entries(LANDING_PAGES)) {
  const { head, html } = render(path);
  const page = template.replace("<!--head-->", head).replace("<!--app-->", html);
  writeFileSync(new URL(`${name}.html`, dist), page);
  console.log(`prerendered ${path} → dist/${name}.html (${(page.length / 1024).toFixed(1)} KB)`);
}
