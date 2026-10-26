# Voice script.json with Kokoro: one WAV per scene in public/voice/, and
# src/voice.json with each scene's duration and word timings (for captions).
#
#   <kokoro venv>/bin/python scripts/narrate.py
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parent.parent
RATE = 24_000
GAP = 0.25  # seconds of silence between Kokoro's chunks

script = json.loads((ROOT / "script.json").read_text())
only = set(sys.argv[1:])
pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
out_dir = ROOT / "public" / "voice"
out_dir.mkdir(parents=True, exist_ok=True)
voice_json = ROOT / "src" / "voice.json"
result = json.loads(voice_json.read_text()) if voice_json.exists() else {}

for scene in script["scenes"]:
    if only and scene["id"] not in only:
        continue
    parts, words, t = [], [], 0.0
    for r in pipeline(scene["text"], voice=script["voice"], speed=script["speed"]):
        audio = r.audio.numpy() if hasattr(r.audio, "numpy") else np.asarray(r.audio)
        for tok in r.tokens or []:
            if tok.start_ts is None or tok.end_ts is None or not tok.text.strip():
                continue
            words.append({"w": tok.text + (tok.whitespace and " " or ""), "s": round(t + tok.start_ts, 3), "e": round(t + tok.end_ts, 3)})
        parts += [audio, np.zeros(int(GAP * RATE), dtype=audio.dtype)]
        t += len(audio) / RATE + GAP
    wav = np.concatenate(parts[:-1])
    sf.write(out_dir / f"{scene['id']}.wav", wav, RATE)
    result[scene["id"]] = {"duration": round(len(wav) / RATE, 3), "words": words}
    print(f"{scene['id']}: {len(wav) / RATE:.1f}s, {len(words)} words")

voice_json.write_text(json.dumps(result, indent=1) + "\n")
print("total", round(sum(v["duration"] for v in result.values()), 1), "s")
