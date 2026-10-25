// Renders the marketing pages to static HTML. Used at build time by
// scripts/prerender.ts and on every request by the Vite dev server.
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { config } from "@/lib/network";
import { MarketingPage } from "./Shell";
import { Home } from "./pages/Home";
import { HowItWorks } from "./pages/HowItWorks";
import { Privacy, Terms } from "./pages/Legal";
import { Security } from "./pages/Security";

interface Page {
  title: string;
  description: string;
  body: () => ReactNode;
}

export const PAGES: Record<string, Page> = {
  "/": {
    title: "ClipPay — pay creators per verified view",
    description:
      "Brands lock a budget in a Stellar smart contract and pay creators per 1,000 verified views. Payouts in minutes, refunds for unspent budget, sign-in with a passkey.",
    body: () => <Home />,
  },
  "/how-it-works": {
    title: "How it works — ClipPay",
    description:
      "The life of a ClipPay campaign: how brands lock budgets, how creators submit posts, what the verifier checks and how payouts are calculated.",
    body: () => <HowItWorks />,
  },
  "/security": {
    title: "Security — ClipPay",
    description:
      "ClipPay's contract addresses, who can move funds, the trust model and known limits of the testnet preview.",
    body: () => <Security />,
  },
  "/terms": {
    title: "Terms of use — ClipPay",
    description: "Terms for the ClipPay testnet preview.",
    body: () => <Terms />,
  },
  "/privacy": {
    title: "Privacy policy — ClipPay",
    description: "What ClipPay stores, what is public on the blockchain, and the services involved.",
    body: () => <Privacy />,
  },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function render(path: string): { head: string; html: string } {
  const page = PAGES[path];
  if (!page) throw new Error(`no landing page for ${path}`);
  const url = new URL(path, config.siteUrl).href;
  const image = new URL("/og.png", config.siteUrl).href;
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="ClipPay" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n    ");
  const html = renderToStaticMarkup(<MarketingPage path={path}>{page.body()}</MarketingPage>);
  return { head, html };
}
