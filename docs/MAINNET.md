# ClipPay — Mainnet plan

Status: plan. ClipPay runs on Stellar testnet only. Nothing on this page has been
started; it lists what has to be true before real money goes into the contract, and in
what order to get there. Item numbers (P1-…, P2-…) refer to
[improvement-plan.md](improvement-plan.md); threats (T…) to [THREAT_MODEL.md](THREAT_MODEL.md).

## Where we stand

The contract layer is close to mainnet-ready:

- Two-step Ownable, Pausable (refunds keep working while paused), Upgradeable with
  `migrate`, all owner-gated and covered by unauthorized-call tests.
- Token allow-list with recorded decimals, paged creator storage, platform fee
  hard-capped at 20% and fixed per campaign.
- Funds invariant (`Σ paid + Σ fees + remaining == budget`) checked by a property test;
  release profile builds with `overflow-checks = true`.
- `RentPolicy` defaults (30-day margin and instance TTL) are sized for mainnet; testnet
  deployments lower them with `set_rent_policy`.

The gaps are in the verifier, the wallet infrastructure, operations and compliance.

## 1. Blockers

Mainnet does not launch until every row here is done.

| # | Blocker | Why | Done when |
|---|---|---|---|
| B1 | **Real view data** (P1-V1) | The Worker runs `VIEW_PROVIDER=mock`; on mainnet that pays real money for simulated views | YouTube Data API live with a production key and quota handling; mock provider refuses to start when `NETWORK=mainnet` |
| B2 | **Persist review state** (P1-B1) | Post statuses and reviewer decisions live in Durable Object memory; after a restart a rejected post can be settled | Holds and decisions stored in DO storage or D1; test that a restart keeps a rejected post unpaid |
| B3 | **Owner multisig** (P1-B5, T3) | `clippay-admin` is a single hot key that can pause, upgrade and change the verifier | Owner is a multisig account (or hardware wallet), ownership moved with the two-step transfer, signing SOP in the runbook |
| B4 | **Upgrade timelock** (T4) | Today an owner key can swap the Wasm immediately | Upgrades queued with a public delay, or a documented decision to accept the risk at pilot size |
| B5 | **External review / audit** (P2-1, T12) | Contract, smart-account integration and relay are unaudited | Informal review by someone outside the team before the pilot; third-party audit (SDF Audit Bank) before raising limits |
| B6 | **Passkey wallet infrastructure** | `ACCOUNT_WASM_HASH` and `WEBAUTHN_VERIFIER` in `scripts/deploy.sh` are smart-account-kit's testnet deployment | Mainnet account Wasm and WebAuthn verifier confirmed from an official deployment, or uploaded and deployed by us and recorded in `deployments/mainnet.json` |
| B7 | **USDC payouts** (P1-F3) | Mainnet campaigns should pay in a stable asset, not XLM | Circle USDC SAC allow-listed, treasury has a USDC trustline, brand flow checks trustlines |
| B8 | **Production anchor** (P2-3, P2-4) | Cash-out uses `testanchor.stellar.org` | At least one vetted SEP-24 USDC anchor per launch country; our `stellar.toml` (SEP-1) and SEP-45 `client_domain` signing |

## 2. Code and configuration

Mechanical changes; all can be built and tested locally without spending anything.

**Network config**
- `deployments/index.ts` only loads `testnet.json`; add `mainnet.json`.
- Mainnet passphrase is exactly `Public Global Stellar Network ; September 2015`. Check
  the whole string — testnet's also ends in "September 2015".
- SDF runs no public mainnet RPC: pick a provider from the
  [RPC providers list](https://developers.stellar.org/docs/data/apis/rpc/providers).
- Explorer path is `stellar.expert/explorer/public`, not `/mainnet`.

**`scripts/deploy.sh` and `scripts/upgrade.sh`**
- `ensure_key … --fund` uses friendbot; on mainnet keys must already exist and be funded.
- Skip `set_rent_policy` on mainnet so the contract's 30-day defaults apply.
- Mainnet deploys and upgrades use the Wasm from a tagged SEP-55 release, never a local
  build (P1-C10: add `source_repo` / `home_domain` contract metadata and a GitHub
  attestation workflow).
- Fail fast if `NETWORK=mainnet` and the owner is a local single key.

**Relay**
- `SPONSOR_MAX_FEE_XLM=250` was raised for testnet rent. On mainnet one sponsored call
  could burn 250 real XLM: lower it to the measured mainnet cost (P1-B6, expected
  ~1–2 XLM) and add a per-wallet daily budget.
- `OZ_CHANNELS_URL` defaults to the testnet endpoint; use the mainnet one.

**Cloudflare**
- A separate Worker and D1 database for mainnet; nothing shared with the testnet demo.
- Mainnet-only keys (`VERIFIER_SECRET`, `SPONSOR_SECRET`) in that Worker's secrets.

**Hardcoded testnet copy**
- `web/src/lib/wallet.ts` and `packages/pool-client/src/index.ts`: "Switch … to Testnet"
  should name the configured network.
- `verifier/src/og.ts`: the `TESTNET` label on share images.
- `TestnetBadge`, the friendbot link in `web/src/app/new/BudgetStep.tsx`, and testnet
  wording on the landing, How it works, Security and Legal pages: driven by `config.network`.
- `verifier/scripts/seed.ts` (friendbot) never runs on mainnet.
- CI builds the web app for both networks.

## 3. Operations

| Item | Detail |
|---|---|
| Monitoring (P1-B4) | Alerts on owner actions, pause changes, large transfers, settlement failure rate, sponsor balance, TTLs near expiry |
| Event index (P1-B3) | RPC keeps ~7 days of events; index contract events into D1 so payout history survives |
| Cost check (P1-B6) | Measure wallet deploy, first submit, settle and rent on mainnet; feed the numbers into pricing and the relay cap |
| Rent ownership | Document who pays to keep campaigns, submissions and the instance alive (`extend` is open to anyone) |
| Static analysis (P1-C9) | Scout in CI next to the property tests |
| Dispute window (P1-C7) | Not a hard blocker, but it is the main defence against view farms (T1) once budgets grow |
| Deployment log | Date, contract ID, Wasm hash, release tag, commit, owner account, for every mainnet deploy and upgrade |

## 4. Legal and compliance

- Terms and Privacy are drafts for the testnet preview; external legal review before launch (P1-M3).
- Confirm the non-custodial position, brand KYB threshold, creator KYC through the
  anchor (SEP-12), and tax reporting (P1-M5).
- Publish the fee and pricing page (P1-M2).

## 5. Rollout

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 · Prepare | Section 2 changes, B1, B2; dry run of `deploy.sh` against a fresh testnet contract with mainnet-shaped config | All tests green; testnet runs on the same code path mainnet will use |
| 1 · Secure | B3–B6; informal external review | Multisig owner holds the testnet staging contract; review findings fixed |
| 2 · Pilot | B7, B8; mainnet deploy; 1–3 design-partner brands, small USDC budgets, per-campaign cap in the UI | Monitoring live; a full campaign settled and refunded on mainnet; costs measured |
| 3 · Beta | Third-party audit, dispute window, more anchors and view providers | Audit published; limits raised; ecosystem listings (stellar.expert, Lumenloop) |

## Go / no-go checklist

- [ ] Every blocker in section 1 is done
- [ ] `deployments/mainnet.json` reviewed line by line; passphrase checked in full
- [ ] Contract Wasm comes from a tagged release, and its hash matches the attestation
- [ ] Owner is the multisig; verifier and sponsor keys are mainnet-only
- [ ] Read methods (`version`, `fee_bps`, `verifier`, `treasury`, `rent_policy`) return the expected values on mainnet
- [ ] Smoke test: create → submit → settle → refund with a small USDC budget
- [ ] Alerts fire on a test event
- [ ] Contract ID and stellar.expert link added to the README and the deployment log
