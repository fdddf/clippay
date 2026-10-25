#!/usr/bin/env bash
# Build and deploy CampaignPool to testnet, then write env files for the
# verifier and the web app.
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

ensure_key() {
  stellar keys address "$1" >/dev/null 2>&1 || stellar keys generate "$1" --network "$NETWORK" --fund
}

ensure_key clippay-admin
ensure_key clippay-verifier
ensure_key clippay-sponsor  # pays fees for passkey wallets
ensure_key clippay-treasury # receives platform fees
ADMIN=$(stellar keys address clippay-admin)
VERIFIER=$(stellar keys address clippay-verifier)
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
CONTRACT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/campaign_pool.wasm \
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

cat > verifier/.env <<ENV
RPC_URL=$RPC_URL
NETWORK_PASSPHRASE=$PASSPHRASE
CONTRACT_ID=$CONTRACT_ID
TOKEN_ID=$TOKEN_ID
VERIFIER_SECRET=$(stellar keys show clippay-verifier)
# youtube | mock — mock grows views over time so you can demo without an API key
VIEW_PROVIDER=mock
MOCK_VIEWS_PER_SECOND=40
YOUTUBE_API_KEY=
# Checks before a post is paid (YouTube only; see verifier/src/checks.ts)
REQUIRE_OWNERSHIP_TAG=true
REQUIRE_AD_DISCLOSURE=true
MAX_VIEWS_PER_HOUR=500000
MIN_LIKE_RATIO=0.002
MIN_VIEWS_FOR_ENGAGEMENT=5000
MIN_CHANNEL_AGE_DAYS=7
# bearer token for POST /review/:id/:creator (approve or reject flagged posts)
REVIEW_TOKEN=$(openssl rand -hex 16)
POLL_SECONDS=60
PORT=8787
SETTLE_PER_IP_PER_MINUTE=6

# --- fee sponsoring for passkey wallets (POST /relay) ---
ACCOUNT_WASM_HASH=$ACCOUNT_WASM_HASH
WEBAUTHN_VERIFIER=$WEBAUTHN_VERIFIER
SMART_ACCOUNT_DEPLOYER=$SMART_ACCOUNT_DEPLOYER
SPONSOR_SECRET=$(stellar keys show clippay-sponsor)
SPONSOR_MAX_FEE_XLM=250
SPONSOR_MIN_XLM=200
RELAY_PER_IP_PER_MINUTE=20
RELAY_PER_WALLET_PER_MINUTE=6
# Slack/Discord-compatible webhook for low-sponsor alerts (optional)
ALERT_WEBHOOK_URL=
# Set to forward sponsored txs to OpenZeppelin Channels instead (key from https://channels.openzeppelin.com/testnet/gen)
OZ_CHANNELS_URL=https://channels.openzeppelin.com/testnet
OZ_CHANNELS_API_KEY=
ENV

cat > web/.env.local <<ENV
VITE_RPC_URL=$RPC_URL
VITE_NETWORK_PASSPHRASE=$PASSPHRASE
VITE_CONTRACT_ID=$CONTRACT_ID
VITE_TOKEN_ID=$TOKEN_ID
VITE_TOKEN_SYMBOL=$SYMBOL
VITE_VERIFIER_URL=http://localhost:8787
VITE_ACCOUNT_WASM_HASH=$ACCOUNT_WASM_HASH
VITE_WEBAUTHN_VERIFIER=$WEBAUTHN_VERIFIER
ENV

echo
echo "CampaignPool: $CONTRACT_ID"
echo "Token ($SYMBOL): $TOKEN_ID"
echo "Verifier:     $VERIFIER"
echo "Treasury:     $TREASURY (fee ${FEE_BPS} bps)"
echo "Wrote verifier/.env and web/.env.local"
