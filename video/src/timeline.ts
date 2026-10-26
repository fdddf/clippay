// Scene timing: each scene lasts as long as its voice-over (plus a short tail),
// stretched where the footage would otherwise play faster than MAX_RATE.
import script from "../script.json";
import footage from "./footage.json";
import voice from "./voice.json";

export const FPS = 30;
export const INTRO = 2.5; // title card, seconds
export const LEAD = 0.35; // silence before each scene's voice
const TAIL = 0.9;
const MAX_RATE = 1.8;

export interface Word {
  w: string;
  s: number;
  e: number;
}

export interface Scene {
  id: string;
  chapter: string;
  start: number; // frames
  frames: number;
  voice: { duration: number; words: Word[] };
  /** Footage seconds, or null for the motion-graphics outro. */
  footage: number | null;
}

const v = voice as Record<string, Scene["voice"]>;
const f = footage as Record<string, number>;

export const scenes: Scene[] = (() => {
  let t = Math.round(INTRO * FPS);
  return script.scenes.map((s) => {
    const clip = f[s.id] ?? null;
    const seconds = Math.max(LEAD + v[s.id].duration + TAIL, clip ? clip / MAX_RATE : 0);
    const scene: Scene = { id: s.id, chapter: s.chapter, start: t, frames: Math.round(seconds * FPS), voice: v[s.id], footage: clip };
    t += scene.frames;
    return scene;
  });
})();

export const totalFrames = scenes.at(-1)!.start + scenes.at(-1)!.frames;
