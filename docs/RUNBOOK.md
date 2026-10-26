# ClipPay runbook

Commands assume the Stellar CLI keys created by `scripts/deploy.sh`
(`clippay-admin` = owner, `clippay-verifier`, `clippay-sponsor`, `clippay-treasury`) and
the `campaign-pool` contract alias. Add `--network mainnet` and the right keys on mainnet.

```bash
pool() { stellar contract invoke --id campaign-pool --network testnet --source-account clippay-admin -- "$@"; }
```

## Production (Cloudflare)

The live deployment is one Worker, `clippay` ([`verifier/wrangler.jsonc`](../verifier/wrangler.jsonc)):
static web app + `/api` → a Durable Object running the verifier and relay. It settles
every campaign once a minute from its own alarm; the cron trigger only re-arms it.

```bash
pnpm deploy:cloudflare                         # build web, deploy Worker, push secrets
cd verifier && pnpm exec wrangler tail clippay # live logs
cd verifier && pnpm exec wrangler deployments list
curl -s https://clippay.hr.edu.kg/api/health
```

Secrets (`VERIFIER_SECRET`, `SPONSOR_SECRET`, `REVIEW_TOKEN`) are pushed by the deploy
script over stdin. The Worker signs with `clippay-verifier-prod`, a key used nowhere else,
so local verifiers can't collide with its sequence numbers. Post statuses and review
decisions live in the Durable Object's memory and are lost when it restarts.

## Health

```bash
curl -s localhost:8787/health          # verifier key, provider, rules, sponsor balance, sponsorLow
pool version; pool paused; pool fee_bps; pool rent_policy
```

The verifier logs one line per post per pass (`paid`, `on hold: …`, `held for review: …`,
`at cap`, `nothing owed yet`, `error: …`). `[alert]` lines mean the sponsor is low.

## Emergency pause

Stops new campaigns, top-ups, submissions and settlement. Refunds keep working.

```bash
pool pause --caller $(stellar keys address clippay-admin)
pool unpause --caller $(stellar keys address clippay-admin)
```

Pause when: the verifier key may be compromised, views are being faked at scale, or a
contract bug is suspected. The web app shows a maintenance banner while paused.

## Rotating the verifier key

```bash
stellar keys generate clippay-verifier-2 --network testnet --fund
pool set_verifier --verifier $(stellar keys address clippay-verifier-2)
VERIFIER_KEY=clippay-verifier-2 pnpm deploy:cloudflare   # Worker; or update verifier/.env locally
```

Done once on 2026-10-25: the demo contract moved from `clippay-verifier` to
`clippay-verifier-prod`, and `deployments/testnet.json` records the current verifier.

The verifier warns at start-up if its key doesn't match the contract's.

## Topping up the fee sponsor

`/health` reports `sponsorBalance`; below `SPONSOR_MIN_XLM` the verifier logs `[alert]`
and posts to `ALERT_WEBHOOK_URL`. Send XLM to the sponsor address, or set
`OZ_CHANNELS_API_KEY` to let OpenZeppelin Channels pay instead.

On testnet, friendbot only funds new accounts; to add 10,000 XLM to an existing one:

```bash
stellar keys generate tmp --network testnet --fund
stellar tx new account-merge --source-account tmp --account $(stellar keys address clippay-sponsor) --network testnet
stellar keys rm tmp
```

## Reviewing held posts

```bash
curl -s localhost:8787/status/<campaign-id>          # every post's checks and decision
curl -s -X POST localhost:8787/review/<id>/<creator> \
  -H "Authorization: Bearer $REVIEW_TOKEN" -d '{"approve": true}'   # or false to reject
```

Decisions live in the verifier's memory until the event index (P1-B3) lands; re-apply
them after a restart.

## Upgrading the contract

1. Merge the change with tests green (`pnpm test`, `pnpm lint`). If storage layout
   changed, bump `SCHEMA_VERSION` and teach `migrate` to convert old entries.
2. Never renumber `Error` variants; add new ones at the end.
3. Run `./scripts/upgrade.sh` — builds, regenerates bindings, uploads the Wasm, calls
   `upgrade` (owner only) and `migrate`, and prints the new Wasm hash.
4. Check `pool version` and a read (`pool get_campaign --id 0`), then redeploy the web app
   and verifier so they use the regenerated bindings.

Mainnet: use the Wasm attached to a tagged release (SEP-55 build), not a local build,
and have the owner multisig sign.

## Fees, tokens and rent

```bash
pool set_fee --fee_bps 500 --treasury $(stellar keys address clippay-treasury)   # new campaigns only, ≤ 2000
pool allow_token --token <SAC id>            # e.g. USDC; records decimals
pool disallow_token --token <SAC id>         # existing campaigns unaffected
pool set_rent_policy --policy '{"margin":17280,"instance_ttl":120960}'           # ledgers; 17280 = 1 day
pool extend --id <campaign> --start 0 --limit 50                                  # anyone; pays rent
```

Who pays rent: the brand on `create_campaign`, the creator (or the sponsor) on `submit`,
the verifier on `settle`, whoever calls `extend`. Testnet rent is far above mainnet, so
testnet deployments use a 1-day margin and a 7-day instance TTL; mainnet defaults are
30 days for both.

## Ownership transfer (two-step)

```bash
pool transfer_ownership --new_owner <G… or multisig> --live_until_ledger <ledger>
# then, signed by the new owner:
stellar contract invoke --id campaign-pool --network testnet --source-account <new> -- accept_ownership
```
