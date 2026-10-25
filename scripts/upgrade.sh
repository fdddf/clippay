#!/usr/bin/env bash
# Upgrade the deployed CampaignPool in place (keeps its address and state):
# build → upload the new Wasm → `upgrade` (owner only) → `migrate`.
#
#   ./scripts/upgrade.sh                     # contract alias campaign-pool
#   CONTRACT=C... ./scripts/upgrade.sh
#
# See docs/RUNBOOK.md#upgrading-the-contract before running this on mainnet.
set -euo pipefail
cd "$(dirname "$0")/.."

NETWORK=${NETWORK:-testnet}
CONTRACT=${CONTRACT:-campaign-pool}
OWNER=${OWNER:-clippay-admin}

before=$(stellar contract invoke --id "$CONTRACT" --network "$NETWORK" --source-account "$OWNER" --send=no -- version)
stellar contract build
./scripts/bindings.sh
HASH=$(stellar contract upload \
  --wasm target/wasm32v1-none/release/campaign_pool.wasm \
  --source-account "$OWNER" --network "$NETWORK")
stellar contract invoke --id "$CONTRACT" --network "$NETWORK" --source-account "$OWNER" -- \
  upgrade --new_wasm_hash "$HASH" --operator "$(stellar keys address "$OWNER")"
after=$(stellar contract invoke --id "$CONTRACT" --network "$NETWORK" --source-account "$OWNER" -- migrate)

echo
echo "Upgraded $CONTRACT to Wasm $HASH (schema $before → $after)"
