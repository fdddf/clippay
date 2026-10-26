// Writes out/clippay-demo.srt from the voice timings, one cue per sentence,
// timed the way src/timeline.ts places each scene.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const script = read("../script.json");
const voice = read("../src/voice.json");
const footage = read("../src/footage.json");
const FPS = 30, INTRO = 2.5, LEAD = 0.35, TAIL = 0.9, MAX_RATE = 1.8;

const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const written = (t) => t.replace(/SEP forty-five/g, "SEP-45").replace(/SEP twenty-four/g, "SEP-24");

let frame = Math.round(INTRO * FPS);
const cues = [];
for (const s of script.scenes) {
  const v = voice[s.id];
  const start = frame / FPS + LEAD;
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({ s: start + cur[0].s, e: start + cur.at(-1).e, text: written(cur.map((w) => w.w).join("").trim()) });
    cur = [];
  };
  for (const w of v.words) {
    cur.push(w);
    const len = cur.reduce((n, x) => n + x.w.length, 0);
    if (/[.!?]\s*$/.test(w.w) || (/,\s*$/.test(w.w) && len > 40) || len > 90) flush();
  }
  flush();
  const clip = footage[s.id];
  frame += Math.round(Math.max(LEAD + v.duration + TAIL, clip ? clip / MAX_RATE : 0) * FPS);
}
mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../out/clippay-demo.srt", import.meta.url),
  cues.map((c, i) => `${i + 1}\n${stamp(c.s)} --> ${stamp(c.e)}\n${c.text}\n`).join("\n"),
);
console.log(`${cues.length} cues`);
