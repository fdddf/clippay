// ClipPay verifier on Cloudflare Workers. Static assets (the web app) are
// served by the platform; /api/* goes to one Durable Object holding the
// verifier, so settlements and sponsored transactions are serialized and its
// in-memory post status survives between requests. The object settles every
// campaign once a minute from its own alarm; the cron trigger only re-arms
// the alarm in case it was ever lost.
import { DurableObject } from "cloudflare:workers";
import { describeError } from "@clippay/pool-client";
import { createVerifier, envReader, type Verifier } from "./core.ts";
import { ENTRY_HTML, htmlFor } from "../../web/src/routing.ts";
import { deployment } from "@clippay/deployments";
import { campaignHead, handleApi } from "./api.ts";
import { indexEvents } from "./indexer.ts";

interface Env {
  VERIFIER: DurableObjectNamespace<VerifierObject>;
  ASSETS: Fetcher;
  DB: D1Database;
  NETWORK?: string;
  SESSION_SECRET?: string;
  SETTLE?: string;
  [key: string]: unknown;
}

export class VerifierObject extends DurableObject<Env> {
  private verifier?: Promise<Verifier>;

  private get(): Promise<Verifier> {
    this.verifier ??= createVerifier(
      envReader(this.env as unknown as Record<string, string | undefined>),
    ).catch((e) => {
      this.verifier = undefined;
      throw e;
    });
    return this.verifier;
  }

  /** Keeps a settlement pass scheduled roughly every minute. */
  private async arm(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + PASS_MS);
    }
  }

  async alarm(): Promise<void> {
    try {
      // Local `wrangler dev` sets SETTLE=off so it never competes with production.
      if (this.env.SETTLE !== "off") await (await this.get()).settleAll();
    } catch (e) {
      console.error(describeError(e));
    }
    try {
      const d = deployment(this.env.NETWORK ?? "testnet");
      const n = await indexEvents(this.env.DB, {
        rpcUrl: d.rpcUrl,
        networkPassphrase: d.networkPassphrase,
        contractId: d.campaignPool.contractId,
      });
      if (n) console.log(`[index] ${n} new event(s)`);
    } catch (e) {
      console.error("[index]", describeError(e));
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + PASS_MS);
    }
  }

  async fetch(req: Request): Promise<Response> {
    await this.arm();
    const v = await this.get();
    const path = new URL(req.url).pathname.replace(/^\/api/, "") || "/";
    return v.handle(req, { ip: req.headers.get("cf-connecting-ip") ?? "?" }, path);
  }

  async ensureScheduled(): Promise<void> {
    await this.arm();
  }
}

const PASS_MS = 60_000;

const stub = (env: Env) => env.VERIFIER.get(env.VERIFIER.idFromName("main"));

/** Titles and share cards for app pages, so links unfurl with the right preview. */
async function withHead(page: Response, url: URL, env: Env): Promise<Response> {
  let head: { title: string; description: string; image: string } | null = null;
  const c = url.pathname.match(/^\/c\/(\d+)\/?$/);
  if (c) head = await campaignHead(env, Number(c[1])).catch(() => null);
  else if (url.pathname.replace(/\/$/, "") === "/campaigns") {
    head = {
      title: "Campaigns — ClipPay",
      description: "Paid creator campaigns on ClipPay: pick one, post a clip, and get paid per verified view.",
      image: "/og.png",
    };
  }
  const image = new URL(head?.image ?? "/og.png", url).href;
  const set = (content: string | undefined) => ({
    element(el: Element) {
      if (content !== undefined) el.setAttribute("content", content);
    },
  });
  return new HTMLRewriter()
    .on("title", { element: (el) => void (head && el.setInnerContent(head.title)) })
    .on('meta[name="description"]', set(head?.description))
    .on('meta[property="og:title"]', set(head?.title))
    .on('meta[property="og:description"]', set(head?.description))
    .on('meta[property="og:url"]', set(url.href))
    .on('meta[property="og:image"]', set(image))
    .transform(page);
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        const handled = await handleApi(req, {
          DB: env.DB,
          NETWORK: env.NETWORK,
          SESSION_SECRET: env.SESSION_SECRET,
          verifierFetch: (path) => stub(env).fetch(new Request(`https://verifier/api${path}`)),
        }, url.pathname);
        if (handled) return handled;
        return await stub(env).fetch(req);
      } catch (e) {
        return Response.json({ error: describeError(e) }, { status: 500 });
      }
    }
    // Files (/favicon.svg, /manifest.webmanifest…) are served as they are.
    if (url.pathname.includes(".")) return env.ASSETS.fetch(req);
    // Pages: each path belongs to one of the web app's HTML entries (web/src/routing.ts).
    const file = htmlFor(url.pathname);
    const res = await env.ASSETS.fetch(new Request(new URL(file, url), req));
    const page = new Response(res.body, {
      status: res.status,
      headers: { ...Object.fromEntries(res.headers), "Cache-Control": "no-cache" },
    });
    return file === ENTRY_HTML.app ? withHead(page, url, env) : page;
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(stub(env).ensureScheduled().catch((e) => console.error(describeError(e))));
  },
} satisfies ExportedHandler<Env>;
