// The outro: the architecture from the deck, built up box by box as the
// voice names each piece, then an end card with the links.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, Logo } from "./Demo";
import { FPS, LEAD, type Scene } from "./timeline";

/** Seconds into the scene when the nth (0-based) word matching `re` is spoken. */
function at(scene: Scene, re: RegExp, nth = 0) {
  const hits = scene.voice.words.filter((w) => re.test(w.w));
  return LEAD + (hits[nth] ?? hits.at(-1) ?? { s: 0 }).s;
}

const BOX = { w: 440, h: 200 };
const COLS = [150, 740, 1330];
const ROWS = [230, 590];

const boxes = [
  { col: 1, row: 0, title: "CampaignPool", text: "Soroban escrow on OpenZeppelin · pays each post’s new earnings", dark: true, cue: /Soroban/ },
  { col: 0, row: 1, title: "Creator", text: "OZ smart account, signed with a passkey", cue: /passkey/ },
  { col: 1, row: 1, title: "Relay", text: "Sponsors network fees for creators", cue: /sponsored/ },
  { col: 2, row: 0, title: "Verifier", text: "Cloudflare Worker · checks views, indexes events", cue: /Cloudflare/ },
  { col: 2, row: 1, title: "Anchor", text: "SEP-45 + SEP-24 cash-out to a local bank", cue: /anchor/ },
  { col: 0, row: 0, title: "Brand", text: "Freighter wallet · funds and refunds", cue: /escrow/ },
];

const arrows = [
  { x1: 590, y1: 330, x2: 740, y2: 330, cue: /escrow/ },
  { x1: 1330, y1: 330, x2: 1180, y2: 330, cue: /Cloudflare/ },
  { x1: 590, y1: 690, x2: 740, y2: 690, cue: /sponsored/ },
  { x1: 960, y1: 590, x2: 960, y2: 430, cue: /sponsored/ },
  { x1: 1180, y1: 690, x2: 1330, y2: 690, cue: /anchor/ },
];

export function Architecture({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const endAt = at(scene, /ClipPay/, 0) - 0.3;
  const end = interpolate(t, [endAt, endAt + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const show = (cue: RegExp) => spring({ frame: frame - Math.round((at(scene, cue) - 0.2) * FPS), fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 0%, ${C.ink2}, ${C.ink} 70%)`, fontFamily: FONT }}>
      <AbsoluteFill style={{ opacity: 1 - end }}>
        <div style={{ position: "absolute", left: 150, top: 90, color: C.indigoLight, fontSize: 28, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          Under the hood
        </div>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={C.indigoLight} />
            </marker>
          </defs>
          {arrows.map((a, i) => {
            const p = show(a.cue);
            return (
              <line
                key={i}
                x1={a.x1}
                y1={a.y1}
                x2={a.x1 + (a.x2 - a.x1) * p}
                y2={a.y1 + (a.y2 - a.y1) * p}
                stroke={C.indigoLight}
                strokeWidth={4}
                markerEnd={p > 0.95 ? "url(#head)" : undefined}
                opacity={p}
              />
            );
          })}
        </svg>
        {boxes.map((b) => {
          const p = show(b.cue);
          return (
            <div
              key={b.title}
              style={{
                position: "absolute",
                left: COLS[b.col],
                top: ROWS[b.row],
                width: BOX.w,
                height: BOX.h,
                borderRadius: 24,
                padding: 30,
                boxSizing: "border-box",
                background: b.dark ? C.indigo : C.ink2,
                border: `1px solid ${b.dark ? C.indigo : C.line}`,
                opacity: p,
                transform: `translateY(${(1 - p) * 24}px) scale(${0.96 + 0.04 * p})`,
              }}
            >
              <div style={{ color: C.light, fontSize: 38, fontWeight: 700 }}>{b.title}</div>
              <div style={{ color: b.dark ? "#E0E7FF" : C.muted, fontSize: 27, lineHeight: 1.35, marginTop: 10 }}>{b.text}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: end, alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", transform: `translateY(${(1 - end) * 20}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 26, justifyContent: "center" }}>
            <Logo size={96} />
            <div style={{ color: C.light, fontSize: 112, fontWeight: 800, letterSpacing: -3 }}>ClipPay</div>
          </div>
          <div style={{ color: C.muted, fontSize: 44, marginTop: 22, fontWeight: 500 }}>
            Pay creators for views that <span style={{ color: C.indigoLight }}>actually happen.</span>
          </div>
          <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 14, fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 34, color: C.light }}>
            <div>clippay.hr.edu.kg</div>
            <div style={{ color: C.muted }}>github.com/fdddf/clippay</div>
          </div>
          <div style={{ color: C.indigoLight, fontSize: 26, marginTop: 48, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600 }}>
            The bug leader · HackMeridian 2026
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
