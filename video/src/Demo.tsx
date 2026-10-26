import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Architecture } from "./Architecture";
import { FPS, INTRO, LEAD, scenes, type Scene, type Word } from "./timeline";

export const C = {
  ink: "#15162E",
  ink2: "#22244A",
  line: "#33355A",
  light: "#F6F6FA",
  muted: "#C7C9E0",
  indigo: "#4F46E5",
  indigoLight: "#A5B4FC",
  money: "#6EE7B7",
};
export const FONT = "Inter, -apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";

// The browser window the footage plays in.
const WIN = { w: 1664, h: 936, top: 36 };

export function Demo() {
  return (
    <AbsoluteFill style={{ background: C.ink, fontFamily: FONT }}>
      <Sequence durationInFrames={Math.round(INTRO * FPS)}>
        <Title />
      </Sequence>
      {scenes.map((s) => (
        <Sequence key={s.id} from={s.start} durationInFrames={s.frames}>
          <SceneView scene={s} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

function Title() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200 } });
  const out = interpolate(frame, [INTRO * fps - 12, INTRO * fps], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out, background: `radial-gradient(circle at 50% 40%, ${C.ink2}, ${C.ink})` }}>
      <div style={{ transform: `translateY(${(1 - rise) * 30}px)`, opacity: rise, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, justifyContent: "center" }}>
          <Logo size={110} />
          <div style={{ color: C.light, fontSize: 132, fontWeight: 800, letterSpacing: -4 }}>ClipPay</div>
        </div>
        <div style={{ color: C.muted, fontSize: 46, marginTop: 24, fontWeight: 500 }}>
          Pay creators for views that <span style={{ color: C.indigoLight }}>actually happen.</span>
        </div>
        <div style={{ color: C.indigoLight, fontSize: 26, marginTop: 40, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600 }}>
          HackMeridian 2026 · Stellar testnet
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill={C.indigo} />
      <path d="M24 18v28l22-14z" fill="#fff" />
      <circle cx="48" cy="48" r="7" fill="#34D399" />
    </svg>
  );
}

function SceneView({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 8, scene.frames - 8, scene.frames], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {scene.footage === null ? <Architecture scene={scene} /> : <Footage scene={scene} />}
      <Sequence from={Math.round(LEAD * FPS)}>
        <Audio src={staticFile(`voice/${scene.id}.wav`)} />
      </Sequence>
      {scene.footage !== null && <Chapter text={scene.chapter} />}
      <Captions words={scene.voice.words} />
    </AbsoluteFill>
  );
}

function Footage({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const rate = scene.footage! / (scene.frames / FPS);
  const zoom = interpolate(frame, [0, scene.frames], [1, 1.015]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 0%, ${C.ink2}, ${C.ink} 70%)` }}>
      <div
        style={{
          position: "absolute",
          left: (1920 - WIN.w) / 2,
          top: WIN.top,
          width: WIN.w,
          height: WIN.h,
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          border: `1px solid ${C.line}`,
        }}
      >
        <OffthreadVideo
          src={staticFile(`footage/${scene.id}.mp4`)}
          playbackRate={rate}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, transformOrigin: "50% 30%" }}
        />
      </div>
    </AbsoluteFill>
  );
}

function Chapter({ text }: { text: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const out = interpolate(frame, [3.4 * fps, 3.9 * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: (1920 - WIN.w) / 2 + 28,
        top: WIN.top + 92,
        padding: "14px 26px",
        borderRadius: 999,
        background: "rgba(21,22,46,0.92)",
        color: C.light,
        fontSize: 32,
        fontWeight: 600,
        opacity: inn * out,
        transform: `translateX(${(1 - inn) * -24}px)`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      {text}
    </div>
  );
}

const NUMBERS: Record<string, string> = { "forty-five": "45", "twenty-four": "24" };

/** Spoken forms back to how they're written: "SEP forty-five" → "SEP-45". */
function written(words: Word[]): Word[] {
  return words.map((w, i) => {
    const next = words[i + 1]?.w.trim().replace(/[.,]$/, "");
    if (w.w.trim() === "SEP" && next && NUMBERS[next]) return { ...w, w: "SEP-" };
    const n = NUMBERS[w.w.trim().replace(/[.,]$/, "")];
    return n ? { ...w, w: w.w.replace(/^[a-z-]+/, n) } : w;
  });
}

/** Lines of about 52 characters, each shown while it is being spoken. */
function lines(spoken: Word[]) {
  const words = written(spoken);
  const out: { text: Word[]; s: number; e: number }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ text: cur, s: cur[0].s, e: cur.at(-1)!.e });
    cur = [];
  };
  for (const w of words) {
    const len = cur.reduce((n, x) => n + x.w.length, 0);
    if (len + w.w.length > 52) flush();
    cur.push(w);
    if (/[.!?]\s*$/.test(w.w) || (/,\s*$/.test(w.w) && len > 30)) flush();
  }
  flush();
  return out;
}

function Captions({ words }: { words: Word[] }) {
  const frame = useCurrentFrame();
  const t = frame / FPS - LEAD;
  const all = lines(words);
  const line = all.find((l, i) => t >= l.s - 0.05 && t < (all[i + 1]?.s ?? l.e + 0.6));
  if (!line) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: 1500,
          padding: "12px 28px",
          borderRadius: 16,
          background: "rgba(21,22,46,0.88)",
          fontSize: 38,
          lineHeight: 1.3,
          fontWeight: 500,
          color: C.muted,
          textAlign: "center",
          boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
        }}
      >
        {line.text.map((w, i) => (
          <span key={i} style={{ color: t >= w.s ? C.light : C.muted }}>
            {w.w}
          </span>
        ))}
      </div>
    </div>
  );
}

export const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
