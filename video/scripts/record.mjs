// Records the demo footage from the live site with headless Chrome:
// one MP4 per scene in public/footage/, 1920×1080 at 30 fps.
//
//   node scripts/record.mjs creator   problem, solution, join, payout (live site)
//   node scripts/record.mjs brand     launch, manage (dev server on :5175, ?as= preview)
//   node scripts/record.mjs cashout   cashout (live site, same creator wallet)
//
// The creator signs with a software passkey (Chrome's virtual WebAuthn
// authenticator). Its credential and the browser storage are kept in
// frames/state/ so the cash-out phase reuses the wallet the creator phase created.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const ROOT = new URL("..", import.meta.url).pathname;
const LIVE = "https://clippay.umesok.workers.dev";
const DEV = "http://localhost:5175";
const BRAND = "GCTPUZRXMR2JVA6ZGRHBACULWBZ4X6P2OVBQHPX7JCUHX7GLYWAZFBZH"; // Pixel Harbor (demo)
const CAMPAIGN = 2; // Kitebase: the highest rate, so a new wallet earns fastest
const POST = `https://youtube.com/shorts/cp${Date.now().toString(36)}`;
const STATE = `${ROOT}frames/state`;
const CRED = `${STATE}/credential.json`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A visible cursor (headless screenshots have none) with a ring on click. */
const CURSOR = `(() => {
  const draw = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform";
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3l15 12-6.5 1 3.6 7.4-3 1.4-3.6-7.4L5 22z" fill="#15162E" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const p = JSON.parse(sessionStorage.getItem("__cur") || "[-60,-60]");
    c.style.transform = "translate(" + p[0] + "px," + p[1] + "px)";
    document.documentElement.appendChild(c);
  };
  addEventListener("mousemove", (e) => {
    draw();
    const c = document.getElementById("__cur");
    c.style.transform = "translate(" + (e.clientX - 5) + "px," + (e.clientY - 3) + "px)";
    sessionStorage.setItem("__cur", JSON.stringify([e.clientX - 5, e.clientY - 3]));
  }, true);
  addEventListener("mousedown", (e) => {
    const r = document.createElement("div");
    r.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;width:36px;height:36px;border-radius:50%;border:3px solid #4F46E5;left:" + (e.clientX - 18) + "px;top:" + (e.clientY - 18) + "px;opacity:.9;transition:transform .45s ease-out,opacity .45s ease-out";
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 600);
  }, true);
  if (document.readyState !== "loading") draw(); else addEventListener("DOMContentLoaded", draw);
})();`;

const STORAGE = `${STATE}/storage.json`;

/** Headless Chrome at 1600×900 CSS px, 1920×1080 device px; `restore` reuses the creator's saved storage. */
async function launch({ restore = false } = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1.2,
    colorScheme: "light",
    ...(restore ? { storageState: STORAGE } : {}),
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  if (process.env.DEBUG) {
    await context.addInitScript(() => {
      const c = navigator.credentials;
      for (const k of ["create", "get"]) {
        const f = c[k].bind(c);
        c[k] = async (o) => {
          const pk = o?.publicKey ?? {}; const b64 = (x) => btoa(String.fromCharCode(...new Uint8Array(x.buffer ?? x))).slice(0, 12);
          console.log(`webauthn.${k} start rp=${pk.rpId ?? pk.rp?.id} uv=${pk.userVerification} timeout=${pk.timeout} allow=${(pk.allowCredentials ?? []).map((c) => b64(c.id)).join(',')} hints=${pk.hints} med=${o?.mediation}`);
          try { const r = await f(o); console.log(`webauthn.${k} ok`); return r; } catch (e) { console.log(`webauthn.${k} ${e.name}: ${e.message} focus=${document.hasFocus()} vis=${document.visibilityState}`); throw e; }
        };
      }
    });
    page.on("console", (m) => console.log("  [console]", m.type(), m.text().slice(0, 200)));
    page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  }
  context.close = async () => browser.close();
  return { context, page };
}

/** Keep the creator's wallet (localStorage + IndexedDB) for the cash-out phase. */
const saveStorage = (context) => context.storageState({ path: STORAGE, indexedDB: true });

const AUTHENTICATOR = { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true };

/** Software passkey for this page's origin; restores a saved credential if there is one. */
async function passkey(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: AUTHENTICATOR });
  if (existsSync(CRED)) {
    for (const credential of JSON.parse(readFileSync(CRED, "utf8"))) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
  }
  let current = authenticatorId;
  return {
    /**
     * Opening a popup resets the page's virtual authenticator environment:
     * enable it again in a fresh session and restore the saved credential,
     * its signature counter moved past any use since it was saved.
     */
    reattach: async () => {
      const fresh = await page.context().newCDPSession(page);
      await fresh.send("WebAuthn.enable", { enableUI: false });
      ({ authenticatorId: current } = await fresh.send("WebAuthn.addVirtualAuthenticator", { options: AUTHENTICATOR }));
      for (const credential of JSON.parse(readFileSync(CRED, "utf8"))) {
        await fresh.send("WebAuthn.addCredential", { authenticatorId: current, credential: { ...credential, signCount: credential.signCount + 100 } });
      }
    },
    save: async () => {
      const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
      writeFileSync(CRED, JSON.stringify(credentials));
      console.log(`  saved ${credentials.length} passkey credential(s)`);
    },
  };
}

/** Screencast one page into frames/<scene>/, then encode public/footage/<scene>.mp4. */
async function scene(page, name, run) {
  // ONLY=join,payout records just those scenes (the others' steps are skipped).
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(name)) return page;
  console.log(`● ${name}`);
  const dir = `${ROOT}frames/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  let paused = false;
  let target = page;
  let cdp;
  const start = async (p) => {
    cdp = await p.context().newCDPSession(p);
    cdp.on("Page.screencastFrame", async (f) => {
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      if (paused) return;
      const file = `${dir}/${String(frames.length).padStart(5, "0")}.jpg`;
      writeFileSync(file, Buffer.from(f.data, "base64"));
      frames.push({ file, t: f.metadata.timestamp, gap: frames.gapNext ?? false });
      frames.gapNext = false;
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  };
  const stop = async () => {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await cdp.detach().catch(() => {});
  };
  await start(page);
  const ctl = {
    /** Leave a stretch out of the footage (waiting on the network). */
    pause: () => void (paused = true),
    resume: () => void ((paused = false), (frames.gapNext = true)),
    /** Record another page (a popup) from now on. */
    switchTo: async (p) => (await stop(), (target = p), await start(p)),
  };
  await sleep(400);
  try {
    await run(ctl);
  } catch (e) {
    await target.screenshot({ path: `${ROOT}frames/fail-${name}.png` }).catch(() => {});
    console.error(`  failed; screenshot frames/fail-${name}.png`);
    throw e;
  }
  await sleep(600);
  await stop();
  if (frames.length < 2) throw new Error(`${name}: no frames`);

  // Each frame lasts until the next one; across a pause, one frame's worth.
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const next = frames[i + 1];
    const d = !next ? 0.5 : next.gap ? 1 / 30 : Math.min(next.t - frames[i].t, 3);
    lines.push(`file '${frames[i].file}'`, `duration ${Math.max(d, 1 / 120).toFixed(4)}`);
  }
  lines.push(`file '${frames.at(-1).file}'`);
  writeFileSync(`${dir}/list.txt`, lines.join("\n"));
  mkdirSync(`${ROOT}public/footage`, { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`,
    "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium",
    `${ROOT}public/footage/${name}.mp4`,
  ]);
  rmSync(dir, { recursive: true, force: true });
  const secs = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${ROOT}public/footage/${name}.mp4`]).toString().trim();
  console.log(`  ${name}.mp4 ${Number(secs).toFixed(1)}s (${frames.length} frames)`);
  return target;
}

// ------------------------------------------------------------- gestures

async function moveTo(page, locator, { dx = 0, dy = 0 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) throw new Error(`not visible: ${locator}`);
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 28 });
  await sleep(180);
}

async function click(page, locator, opts) {
  await moveTo(page, locator, opts);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(350);
}

async function type(page, locator, text, delay = 28) {
  await click(page, locator);
  await page.keyboard.type(text, { delay });
  await sleep(250);
}

/** Smooth scroll by `px` over about `ms`. */
async function scroll(page, px, ms = 1200) {
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await sleep(16);
  }
  await sleep(250);
}

async function scrollTo(page, locator, offset = 120, ms = 1200) {
  const y = await locator.evaluate((el) => el.getBoundingClientRect().top);
  await scroll(page, y - offset, ms);
}

// ------------------------------------------------------------- phases

async function creator() {
  // ONLY=problem,solution needs no wallet; payout without join continues
  // with the wallet the last run created.
  const only = process.env.ONLY?.split(",") ?? [];
  const resume = only.includes("payout") && !only.includes("join") && existsSync(STORAGE);
  const keep = only.length > 0 && !only.includes("join");
  if (!keep) {
    rmSync(STATE, { recursive: true, force: true });
    mkdirSync(STATE, { recursive: true });
  }
  const { context, page } = await launch({ restore: resume });
  const key = await passkey(page);
  await page.goto(resume ? `${LIVE}/c/${CAMPAIGN}` : LIVE, { waitUntil: "networkidle" });
  await page.mouse.move(700, 620);
  await sleep(1500);

  await scene(page, "problem", async () => {
    await sleep(2500);
    await moveTo(page, page.getByRole("heading", { level: 1 }), { dx: 120 });
    await sleep(3500);
    await moveTo(page, page.getByText("Latest payouts").first(), { dy: 60 });
    await sleep(4000);
    await moveTo(page, page.getByText("Featured campaign").first(), { dy: 120 });
    await sleep(4500);
  });

  await scene(page, "solution", async () => {
    await scrollTo(page, page.getByText("Check every number on-chain"), 160, 1400);
    await sleep(1500);
    await moveTo(page, page.getByText("Paid to creators").first());
    await sleep(1800);
    await scrollTo(page, page.getByText("Three steps from brief to payout"), 110, 1600);
    await sleep(2500);
    await moveTo(page, page.getByText("A brand locks a budget"));
    await sleep(1600);
    await moveTo(page, page.getByText("Views become payouts"));
    await sleep(1600);
    await scrollTo(page, page.getByText("Your money follows rules anyone can check"), 110, 1600);
    await sleep(2200);
    await moveTo(page, page.getByText("Verifiable payouts"));
    await sleep(2000);
  });

  await scene(page, "join", async (ctl) => {
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await click(page, page.locator('header a[href="/campaigns"]').first());
    await page.waitForURL(/\/campaigns$/);
    await page.locator(`a[href="/c/${CAMPAIGN}"]`).first().waitFor({ timeout: 60_000 });
    await sleep(1400);
    await click(page, page.locator(`a[href="/c/${CAMPAIGN}"]`).first());
    await page.getByText("Join this campaign").waitFor();
    await sleep(1500);
    await moveTo(page, page.getByText("Earn up to").first());
    await sleep(1600);
    await type(page, page.locator("#post-url"), POST, 18);
    await click(page, page.getByRole("button", { name: "Sign in & join" }));
    await page.getByRole("button", { name: "Create a wallet" }).waitFor();
    await sleep(900);
    await click(page, page.getByRole("button", { name: "Create a wallet" }));
    await type(page, page.getByLabel("Name for this passkey"), "Demo creator");
    await click(page, page.getByRole("button", { name: "Create wallet" }));
    ctl.pause();
    await page.getByText("Your wallet is ready").waitFor({ timeout: 120_000 });
    ctl.resume();
    await sleep(2200);
    await click(page, page.getByRole("button", { name: "Got it" }));
    await key.save();
    await saveStorage(context);
    await sleep(800);
    ctl.pause();
    await page.getByText("You're in").first().waitFor({ timeout: 120_000 });
    ctl.resume();
    await sleep(1500);
    await moveTo(page, page.getByText(/clippay:[a-z0-9]{6}/i).first());
    await sleep(2500);
  });

  await scene(page, "payout", async (ctl) => {
    ctl.pause();
    await sleep(25_000); // let some views accrue
    ctl.resume();
    await moveTo(page, page.getByRole("button", { name: "Refresh my views" }));
    await click(page, page.getByRole("button", { name: "Refresh my views" }));
    ctl.pause();
    await page.getByText(/Paid/).first().waitFor({ timeout: 120_000 });
    ctl.resume();
    await sleep(3000);
    await click(page, page.getByRole("tab", { name: /Creators/ }));
    await sleep(1200);
    await click(page, page.getByRole("button", { name: /Show payouts to (?!this creator)/ }).first());
    await sleep(2500);
    await page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(900);
    await click(page, page.getByRole("button", { name: "Share campaign" }).first());
    await sleep(2200);
    await page.keyboard.press("Escape");
    await page.goto(`${LIVE}/api/og/c/${CAMPAIGN}.png`);
    await sleep(3500);
  });

  await context.close();
}

async function brand() {
  const { context, page } = await launch();
  await page.goto(`${DEV}/new?as=${BRAND}`, { waitUntil: "networkidle" });
  await page.mouse.move(800, 300);
  await sleep(1200);

  await scene(page, "launch", async () => {
    await type(page, page.getByLabel("Title"), "Pixel Harbor — Tidewalker speedrun clips", 22);
    await click(page, page.getByRole("button", { name: /Start from a template/ }));
    await sleep(600);
    await page.getByRole("menuitem").first().click().catch(() => {});
    await sleep(900);
    await type(page, page.getByLabel("Summary"), "Your fastest Tidewalker tide-pool run, in under a minute.", 18);
    await moveTo(page, page.getByText("How creators will see it"), { dy: 200 });
    await sleep(1500);
    await click(page, page.getByRole("button", { name: "Continue" }));
    await sleep(1200);
    const budget = page.getByLabel("Total budget");
    await budget.fill("");
    await type(page, budget, "50");
    const cap = page.getByLabel("Max per creator");
    await cap.fill("");
    await type(page, cap, "10");
    await click(page, page.getByRole("radio", { name: "14 days" }));
    await sleep(800);
    await moveTo(page, page.getByText(/views|creators/i).last());
    await sleep(2200);
    await click(page, page.getByRole("button", { name: "Continue" }));
    await sleep(2500);
    await scroll(page, 380, 1200);
    await sleep(1500);
    await moveTo(page, page.getByRole("button", { name: /& launch/ }));
    await sleep(2500);
  });

  await page.goto(`${DEV}/dashboard/campaigns/0?as=${BRAND}`, { waitUntil: "networkidle" });
  await page.getByText("Cost per 1k views").first().waitFor();
  await sleep(800);
  await scene(page, "manage", async () => {
    await moveTo(page, page.getByText("Cost per 1k views").first(), { dy: 30 });
    await sleep(2200);
    await moveTo(page, page.getByText("Budget left").first(), { dy: 40 });
    await sleep(1800);
    await scrollTo(page, page.getByText("Spend per hour").first(), 160, 1400);
    await sleep(2400);
    await scrollTo(page, page.getByRole("heading", { name: "Creators" }).first(), 140, 1400);
    await sleep(2600);
    await page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(1000);
    await moveTo(page, page.getByRole("button", { name: /Refund/ }));
    await sleep(1500);
    await moveTo(page, page.getByRole("button", { name: /Export creators/ }));
    await sleep(1500);
  });
  await context.close();
}

async function cashout() {
  const { context, page } = await launch({ restore: true });
  const key = await passkey(page);
  await page.goto(`${LIVE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByText(/Hi,|Overview/).first().waitFor({ timeout: 60_000 });
  await page.mouse.move(900, 400);
  await sleep(1500);
  await scene(page, "cashout", async (ctl) => {
    await sleep(1800);
    await click(page, page.getByRole("link", { name: "Earnings" }).first());
    await sleep(2800);
    await click(page, page.getByRole("link", { name: "Wallet" }).first());
    await sleep(1500);
    await type(page, page.locator("#cashout-amount"), "2");
    const popup = page.context().waitForEvent("page", { timeout: 90_000 });
    await click(page, page.getByRole("button", { name: "Continue" }));
    ctl.pause();
    const anchor = await popup;
    // The anchor window opens blank and takes focus; WebAuthn only answers the
    // focused page, so hand focus back until the passkey sign-in is done.
    await page.bringToFront();
    await anchor.waitForURL((u) => !u.href.startsWith("about:"), { timeout: 120_000 });
    await anchor.setViewportSize({ width: 1600, height: 900 }).catch(() => {});
    await anchor.bringToFront();
    await anchor.waitForLoadState("networkidle");
    await sleep(1500);
    ctl.resume();
    await ctl.switchTo(anchor);
    await sleep(1200);
    // The SEP-24 reference UI on testanchor.stellar.org; obvious demo values.
    const fields = { amount: "2", name: "Demo", surname: "Creator", email: "demo@example.com", bank: "Test Bank", account: "12345678" };
    for (const [id, value] of Object.entries(fields)) await type(anchor, anchor.locator(`#${id}`), value, 20);
    await click(anchor, anchor.getByRole("button", { name: "Submit" }));
    await sleep(2500);
    // Close the anchor's window, as a person would: the passkey prompt that
    // follows needs the app's page to have focus.
    ctl.pause();
    if (!anchor.isClosed()) await anchor.close();
    await key.reattach();
    ctl.resume();
    await page.bringToFront();
    await ctl.switchTo(page);
    ctl.pause();
    await page.getByRole("button", { name: "Confirm with passkey" }).waitFor({ timeout: 120_000 });
    ctl.resume();
    await sleep(1500);
    await click(page, page.getByRole("button", { name: "Confirm with passkey" }));
    ctl.pause();
    await page.getByText(/on its way to your bank|Waiting for the anchor/).first().waitFor({ timeout: 120_000 });
    ctl.resume();
    await sleep(3500);
  });
  await context.close();
}

const phases = { creator, brand, cashout };
const phase = process.argv[2];
if (!phases[phase]) {
  console.error(`usage: node scripts/record.mjs ${Object.keys(phases).join("|")}`);
  process.exit(1);
}
await phases[phase]();
