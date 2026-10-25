// Share images for campaign pages (/c/:id): an SVG card rendered to a
// 1200×630 PNG with resvg. Cached per campaign state in the isolate.
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import interRegular from "@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf";
import interSemiBold from "@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf";
import type { Campaign } from "../../web/src/lib/api-types.ts";
import { CATEGORY_LABEL, PLATFORM_LABEL } from "../../web/src/lib/brief.ts";
import { formatUnits, hash32, timeLeft } from "../../web/src/lib/format.ts";

let ready: Promise<void> | null = null;
const fonts = [new Uint8Array(interRegular), new Uint8Array(interSemiBold)];

const cache = new Map<string, Uint8Array>();
const CACHE_MAX = 64;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word wrap by an average glyph width; long words are cut. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const last = lines[maxLines - 1]!;
    lines.length = maxLines;
    lines[maxLines - 1] = `${last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last}…`;
  }
  return lines;
}

const STATUS: Record<Campaign["status"], { label: string; fg: string; bg: string }> = {
  live: { label: "Live", fg: "#1f7a46", bg: "#e1f5e8" },
  ending: { label: "Ending soon", fg: "#8a5a00", bg: "#fdf0d5" },
  settling: { label: "Final payouts", fg: "#1f5fa8", bg: "#e2edfb" },
  closed: { label: "Closed", fg: "#5b5f78", bg: "#eceef5" },
  spent: { label: "Budget spent", fg: "#5b5f78", bg: "#eceef5" },
};

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

interface Card {
  brandName: string;
  symbol: string;
  /** Shown at the bottom, e.g. "clippay.example" */
  host: string;
  logo: { hash: string; mime: string; body: Uint8Array } | null;
}

function brandMark(c: Campaign, name: string, logo: Card["logo"]): string {
  if (logo) {
    const b64 = base64(logo.body);
    return `<clipPath id="logo"><rect x="72" y="150" width="88" height="88" rx="24"/></clipPath>
      <rect x="72" y="150" width="88" height="88" rx="24" fill="#fff" stroke="#e3e5f0"/>
      <image href="data:${logo.mime};base64,${b64}" x="72" y="150" width="88" height="88" clip-path="url(#logo)" preserveAspectRatio="xMidYMid slice"/>`;
  }
  const h = hash32(c.brand);
  const hue = h % 360;
  const hue2 = (hue + 40 + ((h >>> 9) % 80)) % 360;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return `<linearGradient id="avatar" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 60% 55%)"/><stop offset="1" stop-color="hsl(${hue2} 62% 42%)"/>
    </linearGradient>
    <rect x="72" y="150" width="88" height="88" rx="24" fill="url(#avatar)"/>
    <text x="116" y="207" text-anchor="middle" font-size="34" font-weight="600" fill="#fff">${esc(initials)}</text>`;
}

export function campaignOgSvg(c: Campaign, { brandName, symbol, host, logo }: Card): string {
  const sym = esc(symbol);
  const status = STATUS[c.status];
  const left = timeLeft(c.deadline);
  const statusText = c.status === "live" || c.status === "ending" ? `${status.label} · ${left ?? "ending"} left` : status.label;
  const statusW = 32 + statusText.length * 11.5;
  const budget = BigInt(c.budget);
  const pctLeft = budget > 0n ? Number((BigInt(c.remaining) * 100n) / budget) : 0;
  const tags = c.brief ? `${PLATFORM_LABEL[c.brief.platform]} · ${CATEGORY_LABEL[c.brief.category]}` : "Creator campaign";
  const title = wrap(c.title, 34, 2);
  const titleY = title.length === 1 ? 336 : 318;
  const amt = (u: string, frac = 2) => formatUnits(BigInt(u), c.decimals, frac);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Inter">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8f8fd"/><stop offset="1" stop-color="#eceefb"/></linearGradient>
    <radialGradient id="glow" cx="0.9" cy="0" r="0.75"><stop offset="0" stop-color="#6366f1" stop-opacity="0.2"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></radialGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <g transform="translate(72 56)">
    <rect width="44" height="44" rx="11" fill="url(#mark)"/>
    <path d="M13 13.4c0-1.6 1.7-2.5 3.1-1.7l11.8 7c1.4.8 1.4 2.8 0 3.6l-11.8 7c-1.4.8-3.1-.2-3.1-1.7z" fill="#fff"/>
    <circle cx="32.7" cy="32" r="4.5" fill="#34d399"/>
    <text x="58" y="31" font-size="26" font-weight="600" fill="#1c1d2e">ClipPay</text>
  </g>
  <g transform="translate(1024 62)">
    <rect width="104" height="32" rx="16" fill="#fdf3d8" stroke="#e9cf8a"/>
    <text x="52" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="#8a5a00" letter-spacing="1.5">TESTNET</text>
  </g>

  ${brandMark(c, brandName, logo)}
  <text x="184" y="190" font-size="30" font-weight="600" fill="#1c1d2e">${esc(brandName)}</text>
  <text x="184" y="226" font-size="22" fill="#5b5f78">${esc(tags)}</text>
  <g transform="translate(${1128 - statusW} 172)">
    <rect width="${statusW}" height="40" rx="20" fill="${status.bg}"/>
    <circle cx="20" cy="20" r="5" fill="${status.fg}"/>
    <text x="34" y="27" font-size="19" font-weight="600" fill="${status.fg}">${esc(statusText)}</text>
  </g>

  ${title.map((l, i) => `<text x="72" y="${titleY + i * 64}" font-size="54" font-weight="600" fill="#1c1d2e" letter-spacing="-1.5">${esc(l)}</text>`).join("\n  ")}

  <g transform="translate(72 456)">
    <rect width="1056" height="118" rx="22" fill="#fff" stroke="#e3e5f0"/>
    <text x="32" y="58" font-size="40" font-weight="600" fill="#178a6c" letter-spacing="-1">${amt(c.ratePer1k)} <tspan font-size="22" font-weight="400" fill="#5b5f78">${sym}</tspan></text>
    <text x="32" y="90" font-size="19" fill="#5b5f78">per 1,000 views</text>
    <line x1="300" y1="28" x2="300" y2="90" stroke="#e3e5f0" stroke-width="2"/>
    <text x="332" y="58" font-size="40" font-weight="600" fill="#1c1d2e" letter-spacing="-1">${amt(c.capPerCreator, 0)} <tspan font-size="22" font-weight="400" fill="#5b5f78">${sym}</tspan></text>
    <text x="332" y="90" font-size="19" fill="#5b5f78">max per creator</text>
    <line x1="600" y1="28" x2="600" y2="90" stroke="#e3e5f0" stroke-width="2"/>
    <text x="632" y="58" font-size="40" font-weight="600" fill="#1c1d2e" letter-spacing="-1">${pctLeft}%</text>
    <text x="632" y="90" font-size="19" fill="#5b5f78">of ${amt(c.budget, 0)} ${sym} budget left</text>
    <rect x="884" y="49" width="140" height="10" rx="5" fill="#eceef5"/>
    <rect x="884" y="49" width="${Math.max(4, Math.round(1.4 * pctLeft))}" height="10" rx="5" fill="#4f46e5"/>
  </g>
  <text x="1128" y="610" text-anchor="end" font-size="17" fill="#7a7e96">${esc(host)}/c/${c.id}</text>
</svg>`;
}

/** The campaign's share image as PNG. */
export async function campaignOgPng(c: Campaign, card: Card): Promise<Uint8Array> {
  const { brandName, logo } = card;
  // Re-render only when what the card shows changes.
  const budget = BigInt(c.budget);
  const pctLeft = budget > 0n ? Number((BigInt(c.remaining) * 100n) / budget) : 0;
  const key = [c.id, c.status, pctLeft, timeLeft(c.deadline)?.split(" ")[0], brandName, logo?.hash, c.title].join("|");
  const hit = cache.get(key);
  if (hit) return hit;

  ready ??= initWasm(resvgWasm);
  await ready;
  // resvg reads PNG and JPEG; other logos fall back to the initials mark.
  const usable = logo && /^image\/(png|jpeg)$/.test(logo.mime) ? logo : null;
  const resvg = new Resvg(campaignOgSvg(c, { ...card, logo: usable }), {
    font: { fontBuffers: fonts, defaultFontFamily: "Inter", sansSerifFamily: "Inter" },
    fitTo: { mode: "width", value: 1200 },
  });
  const image = resvg.render();
  const png = image.asPng();
  image.free();
  resvg.free();

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, png);
  return png;
}
