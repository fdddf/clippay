#!/usr/bin/env bash
# Build and deploy CampaignPool, then record the deployment in
# deployments/<network>.json — the one place the web app and the verifier read
# contract IDs from. Secrets (and only secrets) go to verifier/.env.
#
#   ./scripts/deploy.sh                 # pays in native XLM (no trustlines needed)
#   TOKEN=usdc ./scripts/deploy.sh      # pays in Circle testnet USDC
#   SETTLE_GRACE=86400 ./scripts/deploy.sh
#   FEE_BPS=1000 ./scripts/deploy.sh   # platform fee taken from payouts (max 2000)
set -euo pipefail
cd "$(dirname "$0")/.."

NETWORK=${NETWORK:-testnet}
RPC_URL=${RPC_URL:-https://soroban-testnet.stellar.org}
PASSPHRASE=${PASSPHRASE:-"Test SDF Network ; September 2015"}
SETTLE_GRACE=${SETTLE_GRACE:-300} # seconds after a deadline the verifier can still settle
FEE_BPS=${FEE_BPS:-500}           # 5% platform fee
# Rent policy (ledgers; 17280/day). Testnet rent is very high, so keep entries
# alive only one day past settlement and renew the instance weekly.
RENT_MARGIN=${RENT_MARGIN:-17280}
INSTANCE_TTL=${INSTANCE_TTL:-120960}
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
# OpenZeppelin smart account + WebAuthn verifier deployed by smart-account-kit
# (stellar/smart-account-kit demo/.env.example, protocol 27 deployment).
ACCOUNT_WASM_HASH=1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a
WEBAUTHN_VERIFIER=CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F
# smart-account-kit's shared, sign-only default deployer (seed "openzeppelin-smart-account-kit")
SMART_ACCOUNT_DEPLOYER=GAAH4OT36RRCCAGKARGPN2HLHT2NOBVFHO4GUHA6CF7UKQ4MMV24WQ4N
OUT=deployments/$NETWORK.json

ensure_key() {
  stellar keys address "$1" >/dev/null 2>&1 || stellar keys generate "$1" --network "$NETWORK" --fund
}

ensure_key clippay-admin
ensure_key clippay-verifier
ensure_key clippay-sponsor  # pays fees for passkey wallets
ensure_key clippay-treasury # receives platform fees
ADMIN=$(stellar keys address clippay-admin)
VERIFIER=$(stellar keys address clippay-verifier)
SPONSOR=$(stellar keys address clippay-sponsor)
TREASURY=$(stellar keys address clippay-treasury)

case "${TOKEN:-native}" in
  native) ASSET=native; SYMBOL=XLM ;;
  usdc)   ASSET="USDC:$USDC_ISSUER"; SYMBOL=USDC ;;
  *)      echo "TOKEN must be native or usdc" >&2; exit 1 ;;
esac
TOKEN_ID=$(stellar contract id asset --asset "$ASSET" --network "$NETWORK")
# Make sure the SAC exists (no-op error if it's already deployed)
stellar contract asset deploy --asset "$ASSET" --source-account clippay-admin --network "$NETWORK" >/dev/null 2>&1 || true
if [ "${TOKEN:-native}" = usdc ]; then
  # The treasury needs a trustline to receive USDC fees.
  stellar tx new change-trust --line "$ASSET" --source-account clippay-treasury --network "$NETWORK" >/dev/null 2>&1 || true
fi

stellar contract build
./scripts/bindings.sh
# Upload is skipped by the CLI when this exact Wasm is already on-chain.
WASM_HASH=$(stellar contract upload \
  --wasm target/wasm32v1-none/release/campaign_pool.wasm \
  --source-account clippay-admin --network "$NETWORK")
CONTRACT_ID=$(stellar contract deploy \
  --wasm-hash "$WASM_HASH" \
  --source-account clippay-admin \
  --network "$NETWORK" \
  --alias campaign-pool \
  -- \
  --owner "$ADMIN" \
  --verifier "$VERIFIER" \
  --treasury "$TREASURY" \
  --fee_bps "$FEE_BPS" \
  --settle_grace "$SETTLE_GRACE" \
  --tokens "[\"$TOKEN_ID\"]")
stellar contract invoke --id "$CONTRACT_ID" --source-account clippay-admin --network "$NETWORK" -- \
  set_rent_policy --policy "{\"margin\":$RENT_MARGIN,\"instance_ttl\":$INSTANCE_TTL}" >/dev/null

# Where the web app finds the verifier: "/api" = same origin (the Cloudflare
# Worker serves both). Kept across redeploys if changed by hand.
VERIFIER_URL=$(python3 -c "import json,sys; print(json.load(open('$OUT')).get('verifierUrl',''))" 2>/dev/null || true)
SITE_URL=$(python3 -c "import json,sys; print(json.load(open('$OUT')).get('siteUrl',''))" 2>/dev/null || true)
REPO_URL=$(python3 -c "import json,sys; print(json.load(open('$OUT')).get('repoUrl',''))" 2>/dev/null || true)
mkdir -p deployments
python3 - "$OUT" <<PY
import json, sys
json.dump({
    "network": "$NETWORK",
    "rpcUrl": "$RPC_URL",
    "networkPassphrase": "$PASSPHRASE",
    "explorer": "https://stellar.expert/explorer/$NETWORK",
    "campaignPool": {
        "contractId": "$CONTRACT_ID",
        "wasmHash": "$WASM_HASH",
        "owner": "$ADMIN",
        "verifier": "$VERIFIER",
        "treasury": "$TREASURY",
        "feeBps": $FEE_BPS,
        "settleGrace": $SETTLE_GRACE,
        "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    },
    "token": {"id": "$TOKEN_ID", "symbol": "$SYMBOL", "decimals": 7},
    "smartAccount": {
        "wasmHash": "$ACCOUNT_WASM_HASH",
        "webauthnVerifier": "$WEBAUTHN_VERIFIER",
        "deployer": "$SMART_ACCOUNT_DEPLOYER",
    },
    "sponsor": "$SPONSOR",
    "anchor": {"domain": "testanchor.stellar.org"},
    "verifierUrl": "${VERIFIER_URL:-/api}",
    "siteUrl": "${SITE_URL:-http://localhost:5173}",
    "repoUrl": "${REPO_URL:-https://github.com/fdddf/clippay}",
}, open(sys.argv[1], "w"), indent=2)
open(sys.argv[1], "a").write("\n")
PY

# Secrets only. Everything else comes from $OUT; tunables have defaults in
# verifier/src/core.ts (see verifier/.env.example to override them).
cat > verifier/.env <<ENV
NETWORK=$NETWORK
VERIFIER_SECRET=$(stellar keys show clippay-verifier)
SPONSOR_SECRET=$(stellar keys show clippay-sponsor)
REVIEW_TOKEN=$(openssl rand -hex 16)
# signs web sign-in sessions (verifier/src/session.ts)
SESSION_SECRET=$(openssl rand -hex 32)
# mock | youtube (needs YOUTUBE_API_KEY)
VIEW_PROVIDER=mock
SPONSOR_MAX_FEE_XLM=250
ENV

echo
echo "CampaignPool: $CONTRACT_ID (Wasm $WASM_HASH)"
echo "Token ($SYMBOL): $TOKEN_ID"
echo "Verifier:     $VERIFIER"
echo "Treasury:     $TREASURY (fee ${FEE_BPS} bps)"
echo "Wrote $OUT and verifier/.env"
