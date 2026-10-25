#!/usr/bin/env bash
# Regenerate packages/campaign-pool-bindings/src from the contract's Wasm with
# the JS SDK's binding generator. The package wrapper (package.json) is ours
# and is left alone, so the bindings are consumed as TypeScript source.
#
#   ./scripts/bindings.sh            # after `stellar contract build`
set -euo pipefail
cd "$(dirname "$0")/.."

WASM=${WASM:-target/wasm32v1-none/release/campaign_pool.wasm}
OUT=packages/campaign-pool-bindings
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pnpm --filter @clippay/pool-client exec stellar-js generate \
  --wasm "$PWD/$WASM" --output-dir "$TMP/gen" --contract-name campaign-pool >/dev/null
rm -rf "$OUT/src"
mkdir -p "$OUT"
cp -R "$TMP/gen/src" "$OUT/src"
echo "Wrote $OUT/src from $WASM"
