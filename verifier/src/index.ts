// ClipPay verifier (Node): reads campaigns from CampaignPool, checks each
// submission's views with a ViewProvider, and calls `settle` so creators get paid.
//
//   pnpm dev            # poll every POLL_SECONDS + serve the HTTP API
//   pnpm once           # one settlement pass, then exit
import { createServer } from "node:http";
import { describeError } from "@clippay/pool-client";
import { createVerifier, envReader } from "./core.ts";

const env = envReader(process.env);
const verifier = await createVerifier(env);

console.log(`verifier ${verifier.publicKey} · provider ${verifier.provider.name}`);
console.log(
  `relay ${verifier.relay.mode}${verifier.relay.sponsor ? ` · sponsor ${verifier.relay.sponsor}` : ""}`,
);
const onChainVerifier = (await verifier.pool.verifier()).result;
if (onChainVerifier !== verifier.publicKey) {
  console.warn(`warning: contract expects verifier ${onChainVerifier}`);
}

if (process.argv.includes("--once")) {
  await verifier.settleAll();
  process.exit(0);
}

const pollMs = Number(env("POLL_SECONDS", "60")) * 1000;
const tick = () => verifier.settleAll().catch((e) => console.error(describeError(e)));
setInterval(tick, pollMs);
tick();

const port = Number(env("PORT", "8787"));
createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 256_000) return res.writeHead(413).end();
  }
  const request = new Request(new URL(req.url ?? "/", `http://localhost:${port}`), {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" ? undefined : body,
  });
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const response = await verifier.handle(request, { ip: forwarded || req.socket.remoteAddress || "?" });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(port, () => console.log(`listening on :${port}`));
