// Writes src/footage.json: each recorded clip's duration in seconds.
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";

const dir = new URL("../public/footage/", import.meta.url).pathname;
const out = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".mp4")).sort()) {
  const d = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dir + f]).toString();
  out[f.replace(/\.mp4$/, "")] = Number(Number(d).toFixed(3));
}
writeFileSync(new URL("../src/footage.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(out);
