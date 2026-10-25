// The landing page's only script: fills the prerendered markup with live
// numbers, campaigns and payouts from the Worker's API. No React, no Stellar SDK.
import "@/styles/landing.css";
import type { Campaign, ChainEvent, Profile, Stats } from "@/lib/api-types";
import { CATEGORY_LABEL, PLATFORM_LABEL } from "@/lib/brief";
import { compactNumber, formatUnits, hash32, mediaThumb, relativeTime, shortAddress, timeLeft } from "@/lib/format";
import { storedSession } from "@/lib/session";

const POLL_MS = 20_000;
const OPEN = new Set<Campaign["status"]>(["live", "ending"]);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Whole-token amounts for headline numbers: "583", "12.4K", "0.25". */
function tokens(units: string, decimals: number): string {
  const v = BigInt(units);
  const whole = v / 10n ** BigInt(decimals);
  if (whole >= 10_000n) return compactNumber(whole);
  return formatUnits(v, decimals, whole >= 100n ? 0 : 2, 0);
}

function clone(id: string): DocumentFragment {
  return ($<HTMLTemplateElement>(`#${id}`)!.content.cloneNode(true) as DocumentFragment);
}

function slot(root: ParentNode, name: string): HTMLElement {
  return $(`[data-f="${name}"]`, root)!;
}

function setText(root: ParentNode, values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) slot(root, k).textContent = v;
}

/** An image, or a gradient from the seed with initials (see components/Identicon). */
function avatar(el: HTMLElement, seed: string, name: string | null, src: string | null, square: boolean) {
  const shape = square ? "rounded-[28%]" : "rounded-full";
  el.className = `relative flex size-8 shrink-0 items-center justify-center overflow-hidden text-xs font-semibold text-white ${shape}`;
  if (src) {
    const img = document.createElement("img");
    img.src = mediaThumb(src, 32);
    img.alt = "";
    img.width = img.height = 32;
    img.className = "size-full object-cover";
    el.replaceChildren(img);
    return;
  }
  const h = hash32(seed);
  const hue = h % 360;
  const hue2 = (hue + 40 + ((h >>> 9) % 80)) % 360;
  el.style.background = `linear-gradient(135deg, oklch(0.62 0.15 ${hue}), oklch(0.5 0.16 ${hue2}))`;
  el.textContent = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const media = (hash: string | null | undefined) => (hash ? `/api/media/${hash}` : null);
const avatarSrc = (p: Profile | null) => (p?.avatar ? (p.avatar.startsWith("/") || p.avatar.startsWith("http") ? p.avatar : media(p.avatar)) : null);

const STATUS: Record<Campaign["status"], [string, string]> = {
  live: ["Live", "bg-ok-soft text-ok"],
  ending: ["Ending soon", "bg-warn-soft text-warn"],
  settling: ["Final payouts", "bg-info-soft text-info"],
  closed: ["Closed", "bg-muted text-muted-foreground"],
  spent: ["Budget spent", "bg-muted text-muted-foreground"],
};

function brandName(c: Campaign) {
  return c.brandProfile?.name ?? c.brief?.brand.name ?? shortAddress(c.brand);
}

function campaignCard(c: Campaign, symbol: string): DocumentFragment {
  const f = clone("tpl-campaign");
  slot(f, "link").setAttribute("href", `/c/${c.id}`);
  avatar(slot(f, "avatar"), c.brand, brandName(c), avatarSrc(c.brandProfile) ?? media(c.brief?.brand.logo), true);
  const [label, cls] = STATUS[c.status];
  const status = slot(f, "status");
  status.className = `ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`;
  status.innerHTML = `<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>`;
  status.append(label);

  const budget = BigInt(c.budget);
  const left = budget > 0n ? Number((BigInt(c.remaining) * 100n) / budget) : 0;
  const ends = timeLeft(c.deadline);
  setText(f, {
    brand: brandName(c),
    title: c.title,
    rate: formatUnits(BigInt(c.ratePer1k), c.decimals, 2),
    "rate-unit": `${symbol} per 1k views`,
    cap: `Earn up to ${formatUnits(BigInt(c.capPerCreator), c.decimals, 2, 0)} ${symbol}`,
    left: `${left}% of budget left`,
    meta: `${c.creators} ${c.creators === 1 ? "creator" : "creators"} · ${ends ? `${ends} left` : "ended"}`,
  });
  for (const [k, label] of [
    ["platform", c.brief ? PLATFORM_LABEL[c.brief.platform] : null],
    ["category", c.brief ? CATEGORY_LABEL[c.brief.category] : null],
  ] as const) {
    const el = slot(f, k);
    if (label) el.textContent = label;
    else el.remove();
  }
  const meter = slot(f, "meter");
  meter.setAttribute("aria-valuenow", String(left));
  meter.setAttribute("aria-label", "Budget left");
  slot(f, "bar").style.width = `${left}%`;
  return f;
}

function payoutRow(e: ChainEvent, campaign: Campaign | undefined, fresh: boolean): DocumentFragment {
  const f = clone("tpl-payout");
  const decimals = campaign?.decimals ?? 7;
  avatar(slot(f, "avatar"), e.address ?? "", e.profile?.name ?? null, avatarSrc(e.profile ?? null), false);
  setText(f, {
    name: e.profile?.name ?? shortAddress(e.address ?? ""),
    detail: `${compactNumber(BigInt(e.views ?? "0"))} views${campaign ? ` · ${brandName(campaign)}` : ""}`,
    amount: `+${formatUnits(BigInt(e.amount ?? "0"), decimals, 4)} ${symbol}`,
    time: relativeTime(e.ts),
  });
  if (fresh) (f.firstElementChild as HTMLElement).classList.add("animate-flash");
  return f;
}

let symbol = "XLM";
let seenPayouts = new Set<string>();

async function refreshStats() {
  const dot = $("[data-health]");
  const label = $("[data-health-label]");
  try {
    const s = await get<Stats>("/stats");
    symbol = s.token.symbol;
    const values: Record<string, string> = {
      locked: tokens(s.locked, s.token.decimals),
      paid: tokens(s.paid, s.token.decimals),
      views: compactNumber(BigInt(s.views)),
      creators: compactNumber(s.creators),
      updated: `· updated ${relativeTime(s.updatedAt)}`,
    };
    for (const el of $$("[data-stat]")) el.textContent = values[el.dataset.stat!] ?? el.textContent;
    if (dot) dot.innerHTML = `<span class="size-2 rounded-full bg-ok"></span>`;
    if (label) label.textContent = "All systems normal";
  } catch {
    if (dot) dot.innerHTML = `<span class="size-2 rounded-full bg-warn"></span>`;
    if (label) label.textContent = "Live data unavailable";
  }
}

async function refreshCampaigns() {
  const campaigns = await get<Campaign[]>("/campaigns");
  const open = campaigns
    .filter((c) => OPEN.has(c.status))
    .sort((a, b) => b.creators - a.creators || Number(BigInt(b.paid) - BigInt(a.paid)));

  const list = $("[data-list=campaigns]");
  if (list) {
    list.replaceChildren(...open.slice(0, 3).map((c) => campaignCard(c, symbol)));
    $("[data-empty=campaigns]")!.hidden = open.length > 0;
    list.hidden = open.length === 0;
  }

  // The hero shows the busiest open campaign (or the latest one)…
  const featured = open[0] ?? campaigns.at(-1);
  const hero = $("[data-list=hero-campaign]");
  if (featured && hero) hero.replaceChildren(campaignCard(featured, symbol));

  // …and the latest payout to each of the most recently paid creators.
  const feed = $("[data-list=hero-payouts]");
  if (!feed) return;
  const recent = await get<ChainEvent[]>("/events?type=settled&limit=50");
  const latest = new Map<string, ChainEvent>();
  for (const e of recent) if (e.address && !latest.has(e.address)) latest.set(e.address, e);
  const payouts = [...latest.values()].slice(0, 4);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const first = seenPayouts.size === 0;
  if (payouts.length === 0) {
    feed.innerHTML = `<li class="px-2 py-6 text-center text-sm text-muted-foreground">No payouts yet — the first verified views will show up here.</li>`;
  } else {
    feed.replaceChildren(
      ...payouts.map((e) => payoutRow(e, byId.get(e.campaign ?? -1), !first && !seenPayouts.has(e.id))),
    );
  }
  seenPayouts = new Set(payouts.map((e) => e.id));
}

function authCta() {
  let returning = storedSession() !== null;
  try {
    returning ||= localStorage.getItem("clippay.wallet") !== null;
  } catch {}
  if (!returning) return;
  for (const a of $$("[data-auth-cta]")) a.textContent = "Dashboard";
}

async function refresh() {
  await refreshStats();
  if (!$("[data-list]")) return;
  await refreshCampaigns().catch(() => {
    // Leave the skeletons for the next poll rather than an error on a marketing page.
  });
}

// Links shared when the app used hash routes (`/#/c/3`) land here.
if (location.hash.startsWith("#/")) location.replace(location.hash.slice(1));

authCta();
if ($("[data-stat]") || $("[data-list]") || $("[data-health]")) {
  void refresh();
  setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, POLL_MS);
}

// Close the mobile menu when one of its links is followed (e.g. /#brands).
for (const a of $$("details a")) a.addEventListener("click", () => a.closest("details")?.removeAttribute("open"));
