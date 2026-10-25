#!/usr/bin/env bash
# Deploy ClipPay to Cloudflare: build the web app, deploy the Worker (static
# assets + verifier Durable Object + per-minute settlement cron), and push the
# verifier's secrets from verifier/.env (written by scripts/deploy.sh).
#
#   ./scripts/deploy-cloudflare.sh
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm --filter web build
cd verifier
# Schema first, so the new code never runs against old tables. The D1 API
# sometimes fails a request transiently (code 7403): retry before giving up.
for attempt in 1 2 3; do
  pnpm exec wrangler d1 migrations apply clippay --remote && break
  [ "$attempt" = 3 ] && exit 1
  echo "D1 migrations failed (attempt $attempt), retrying…" >&2
  sleep 5
done
pnpm exec wrangler deploy

# The deployed verifier signs with its own key (VERIFIER_KEY, default
# clippay-verifier-prod) so local verifiers never collide with its sequence
# numbers; the contract must name it (`set_verifier`, see docs/RUNBOOK.md).
VERIFIER_KEY=${VERIFIER_KEY:-clippay-verifier-prod}
VERIFIER_SECRET=$(stellar keys show "$VERIFIER_KEY")

# Secrets go over stdin, never on the command line.
VERIFIER_SECRET="$VERIFIER_SECRET" python3 - <<'PY' | pnpm exec wrangler secret bulk
import json, os
keys = {"SPONSOR_SECRET", "REVIEW_TOKEN", "SESSION_SECRET", "YOUTUBE_API_KEY", "OZ_CHANNELS_API_KEY", "ALERT_WEBHOOK_URL"}
out = {"VERIFIER_SECRET": os.environ["VERIFIER_SECRET"]}
for line in open(".env"):
    k, _, v = line.strip().partition("=")
    if k in keys and v:
        out[k] = v
print(json.dumps(out))
PY
