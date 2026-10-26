# ClipPay demo video

A 2:22 walkthrough of the live testnet site, rendered with Remotion: footage
recorded from the real app, a Kokoro voice-over (`am_liam`), word-timed captions,
and a motion-graphics outro. Not part of the pnpm workspace; install with
`pnpm install --ignore-workspace`.

| Step | Command | Output |
|---|---|---|
| Voice | `KOKORO_PY=<venv>/bin/python pnpm narrate [scene…]` | `public/voice/*.wav`, `src/voice.json` (durations, word timings) |
| Footage | `node scripts/record.mjs creator\|brand\|cashout` | `public/footage/*.mp4` |
| Render | `pnpm render` | `out/clippay-demo.mp4` |

- **Narration** is in `script.json`, one entry per scene. Kokoro needs Python 3.12
  (`uv venv --python 3.12`, then `uv pip install kokoro soundfile` and spaCy's
  `en_core_web_sm` wheel); Homebrew's `espeak-ng` supplies the phoneme data.
- **Footage** comes from headless Chrome (Playwright, the installed Chrome) driven
  through the real flows at 1920×1080. The creator signs with Chrome's virtual
  WebAuthn authenticator, so wallet creation, submission, payouts and the anchor
  cash-out are real testnet transactions. Each run of the `creator` phase makes a
  new wallet and submits a post to campaign 2, which spends the campaign's budget.
  `ONLY=join,payout` (or `problem,solution`) records just those scenes; `DEBUG=1`
  logs the page console and WebAuthn calls.
- **Brand scenes** use the dev server's read-only `?as=` preview (`web-live-api`
  on :5175, API proxied to the live site), because Freighter can't be automated.
  The launch scene stops at the review step; nothing is signed.
- **Timing**: each scene lasts as long as its voice plus a short tail; footage is
  sped up to fit, at most 1.8×, and the scene is stretched beyond that.
