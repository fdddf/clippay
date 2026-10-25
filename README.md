# ClipPay — pay-per-view creator bounties on Stellar

> HackMeridian 2026 · Genesis · Stellar Composed

**Problem.** "Clipping" and UGC campaigns pay creators per 1,000 views, but the money
moves badly in both directions. Brands prepay agencies and hope the views are real.
Creators — mostly in LATAM, SEA and Africa — wait weeks for payouts, lose 5–10% to
PayPal/wire fees, or can't receive at all.

**Solution.** A brand locks its budget in a Soroban contract and sets a rate per 1k
views. Creators submit their post. A verifier reads the post's view count and the
contract pays the creator the difference between what they've earned and what they've
already received — in seconds, for a fraction of a cent. When the campaign ends, the
unearned budget goes back to the brand. Nobody has to trust the other side with money.

**Users.** Brands and app studios running creator campaigns; clippers and short-form
creators who want to be paid fast, anywhere.

**No crypto onboarding for creators.** A creator signs in with Face ID / Touch ID. That
creates an OpenZeppelin smart account secured by their passkey — no seed phrase, no
extension, and no XLM for fees: every creator transaction is fee-sponsored.

## How it works

```
 Brand (Freighter) ──create_campaign──►┌────────────────────┐
                                       │  CampaignPool      │──settle──► USDC / XLM to the
 Creator (passkey)                     │  (Soroban)         │            creator's smart account
   │ signs auth entry with WebAuthn    │  pays Δ earned,    │
   ▼                                   │  capped per creator│──refund──► unspent budget to brand
 /relay ── pays the fee ──submit──────►└────────────────────┘
   (sponsor account or OZ Channels)              ▲
                                                 │ settle(creator, views)
 Verifier ── reads views (YouTube / mock) ───────┘  every N s, or POST /settle/:id
```

| Piece | Path | What it does |
|---|---|---|
| Contract | [`contracts/campaign-pool`](contracts/campaign-pool/src/lib.rs) | Escrow, per-creator accounting, settlement, platform fee, refunds; OZ Ownable / Pausable / Upgradeable |
| Bindings | [`packages/campaign-pool-bindings`](packages/campaign-pool-bindings/src) | Generated from the Wasm by [`scripts/bindings.sh`](scripts/bindings.sh) |
| Shared client | [`packages/pool-client`](packages/pool-client/src/index.ts) | Amounts, fees, paging, error messages on top of the bindings |
| Verifier | [`verifier`](verifier/src/index.ts) | Reads views, runs [payout checks](verifier/src/checks.ts), signs `settle`; HTTP trigger for demos |
| Relay | [`verifier/src/relay.ts`](verifier/src/relay.ts) | Fee-sponsors passkey wallet transactions (`POST /relay`) |
| Web app | [`web`](web/src) | Brand & creator UI (React, smart-account-kit, Freighter) |

### Contract rules (v2)

- `create_campaign` transfers the budget from the brand into the contract. Only
  allow-listed SEP-41 tokens are accepted (`allow_token` records each token's
  `decimals()`, which the campaign keeps).
- `settle(id, creator, views)` can only be called by the verifier. It moves
  `min(views × rate / 1000, cap_per_creator) − already_settled`, limited by the
  remaining budget. A platform fee (`fee_bps`, fixed per campaign when it is created,
  hard-capped at 20%) goes to the treasury; the rest goes to the creator. Reporting the
  same count twice pays nothing; counts can't go down.
- Funds invariant, checked by a property test over 10,000 random runs:
  `Σ paid + Σ fees + remaining == budget`, and no post ever costs more than the cap.
- Submissions close at `deadline`. The verifier can still settle for `settle_grace`
  seconds after that; then the brand can `refund` the rest and the campaign closes.
- Each creator is one fixed-size storage entry, so a submission costs the same whether
  it is the 1st or the 1,000th; `get_submissions(id, start, limit)` pages 50 at a time.
- Admin is OpenZeppelin `Ownable` (two-step transfer). The owner can `pause` (stops new
  campaigns, top-ups, submissions and settlement — **refunds keep working**), `upgrade`
  the Wasm in place and `migrate`, set the verifier, fee and treasury, manage the token
  allow-list, and tune the rent policy. Error codes are frozen: a test fails if the
  contract, the generated bindings and the web app's messages drift apart.
- Rent: campaign entries are extended to the end of settlement plus a margin; the
  instance is renewed at half-life. Both are owner-tunable (`set_rent_policy`) because
  testnet and mainnet rent differ by orders of magnitude.

### Payout checks (verifier)

Before settling, the verifier checks each post ([`checks.ts`](verifier/src/checks.ts)).
Problems the creator can fix put the post on hold until fixed; anti-fraud flags hold it
until a reviewer approves it (`POST /review/:id/:creator`). The campaign page shows
creators and brands why a post is on hold.

- **Ownership** — description contains `clippay:<first 6 chars of the creator's address>`
- **Ad disclosure** — title or description contains `#ad` / `#sponsored`
- **Anti-fraud v1** — view spikes (`MAX_VIEWS_PER_HOUR`), low likes per view, channels
  younger than `MIN_CHANNEL_AGE_DAYS`

Posts already at their cap, or with nothing owed, are skipped without a transaction.

### Passkey wallets & fee sponsoring

Creators use [smart-account-kit](https://github.com/stellar/smart-account-kit), the SDK
for OpenZeppelin's [smart account contracts](https://github.com/OpenZeppelin/stellar-contracts):

1. **Create** — the browser makes a P-256 passkey; the kit derives a smart-account
   address from it and builds a `createContractV2` deployment authorized by the kit's
   shared, sign-only deployer.
2. **Sign** — when a creator submits, our contract calls `creator.require_auth()`. The
   kit signs that auth entry with WebAuthn; the account's `__check_auth` verifies it
   through the deployed WebAuthn verifier contract.
3. **Sponsor** — the kit posts `{ func, auth }` to the verifier's `POST /relay`, the
   same protocol as the OpenZeppelin Relayer (Channels). The relay only accepts
   CampaignPool calls, payout-token transfers (withdrawals) and smart-account
   deployments with the expected Wasm hash, rejects source-account auth, simulates
   with the signed entries, caps the fee, and submits from a sponsor account. With
   `OZ_CHANNELS_API_KEY` set it forwards the validated request to OZ Channels instead.

Payouts go to the creator's smart-account (`C…`) address.

### Cash out to a bank (SEP-24 via SEP-45)

From the wallet menu, **To bank** withdraws through a Stellar anchor
([`packages/anchor`](packages/anchor/src/index.ts), default `testanchor.stellar.org`):

1. **SEP-1** — read the anchor's `stellar.toml`.
2. **SEP-45** — web auth for *contract* accounts (SEP-10 only covers `G…`). The anchor
   returns `web_auth_verify` auth entries; we validate them, sign the wallet's entry
   with the passkey (`kit.signAuthEntry`), and exchange them for a JWT.
3. **SEP-24** — start an interactive withdrawal; the creator enters bank details on
   the anchor's own page.
4. **Pay** — a contract account can't attach a transaction memo, so the anchor's `id`
   memo is encoded into a muxed `M…` destination and paid with the SAC's
   `transfer(from, to: MuxedAddress, amount)` (CAP-67). The transfer is passkey-signed
   and fee-sponsored by `/relay`; the anchor matches it and pays out fiat.

The creator can also send to any Stellar address (**To address**).

### Stellar features used

- **Soroban smart contract** holding funds and enforcing payouts
- **OpenZeppelin smart accounts + WebAuthn verifier** (passkey wallets, via smart-account-kit)
- **Fee sponsoring** with the OpenZeppelin Relayer `{ func, auth }` protocol
- **Anchor cash-out**: SEP-1, SEP-45 (contract-account web auth), SEP-24, muxed SAC transfers (CAP-67)
- **Stellar Asset Contract** for XLM / USDC (SEP-41 token interface)
- **Freighter** for brands
- Contract events (`CampaignCreated`, `Submitted`, `Settled`, `Refunded`) for indexing

## Testnet deployment

| | |
|---|---|
| CampaignPool v2 | [`CAH4SE2CYMGWWTEY4HKJOQ2XAYFEJLC64DR4VZBWX2YBFEC3IVYNGAR2`](https://stellar.expert/explorer/testnet/contract/CAH4SE2CYMGWWTEY4HKJOQ2XAYFEJLC64DR4VZBWX2YBFEC3IVYNGAR2) |
| In-place upgrade (`upgrade` → `migrate`) | [`e8750115…`](https://stellar.expert/explorer/testnet/tx/e875011575e5ed561ca318a767cd372a5d25231f07b8e5641c72a608e6aa9d32) → Wasm `bab6099b…` |
| Token (native XLM SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Verifier | `GA4N2DNUDW5WKDR7RM3KBFJAL3I3S53NEUNUFO626KOVIXLPZVI24L3E` |
| Owner | `GAMO4HPHHKVCX327AGSJILACAEUEJR5VPMTSRCIZONZAU3MYQSWROE6M` |
| Treasury (5% fee) | `GCBQ55XIHJZGOJGSJHUWIL7CZL7DDYWBZXB6AFW226JV52MN4374MLQ7` |
| Example settlement (with fee) | [`4bb1ddae…`](https://stellar.expert/explorer/testnet/tx/4bb1ddaed9456b8384a3fceed42d724b9d9234a7924fba23e88bf41ad389d7ed) |
| v1 contract (retired) | `CCAN5IDEZ3A3AZ5BH7BTETJOSWIHMSIIFXC2ZE53IALQOFZIO6D6LP2W` — settlement [`b848166e…`](https://stellar.expert/explorer/testnet/tx/b848166e1c87df3effe8ba96582eb3bc889d6a7e1cd8b940f4319032f70dd757) |
| Smart account WASM | `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |
| WebAuthn verifier | `CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F` |
| Fee sponsor | `GA32FPOXI3Z4V3HSDFGLNSSJFAHL3OPCGOWSSH2LOQ6NXRTOO6ANFLOW` |
| Passkey wallet deploy (sponsored) | [`8aaf3004…`](https://stellar.expert/explorer/testnet/tx/8aaf3004dd6d43a23e7c496afec3c8058c846d28a447d1b00d4d04e4322df44d) |
| Passkey-signed `submit` to v2 (sponsored) | [`6cb354fb…`](https://stellar.expert/explorer/testnet/tx/6cb354fbfe28f0e0a79fa868fdc2fa718c82c448a5b33f5a4b9a55edd44f5d78) |
| Anchor | `testanchor.stellar.org` (SEP-45 contract `CD3LA6RKF5D2FN2R2L57MWXLBRSEWWENE74YBEFZSSGNJRJGICFGQXMX`) |
| Bank cash-out payment (SEP-24, muxed) | [`19d12e70…`](https://stellar.expert/explorer/testnet/tx/19d12e7070458c437ac5b487b2591d3829d40e5eaf6c97ac42baa1fd6bbf0a35) — 2 XLM → anchor status `completed` |

## Setup

Prerequisites: Rust with the `wasm32v1-none` target, [Stellar CLI](https://developers.stellar.org/docs/tools/cli) ≥ 25, Node ≥ 22, pnpm, and the [Freighter](https://www.freighter.app/) extension set to Testnet.

```bash
pnpm install
pnpm test                  # contract tests + funds invariant, error-code sync, verifier checks
pnpm lint                  # rustfmt + clippy -D warnings
./scripts/deploy.sh        # deploy to testnet, writes verifier/.env and web/.env.local
./scripts/upgrade.sh       # later: upgrade the deployed contract in place
pnpm dev:verifier          # terminal 1 — settles every POLL_SECONDS, serves :8787
pnpm dev:web               # terminal 2 — http://localhost:5173
```

Check the whole passkey path without a browser (software passkey, real testnet):

```bash
cd verifier && pnpm e2e:passkey 0   # creates a wallet, submits to campaign 0, settles
cd verifier && pnpm e2e:anchor 2    # SEP-45 + SEP-24 cash-out; prints the anchor form URL to complete
```

`TOKEN=usdc ./scripts/deploy.sh` pays in Circle testnet USDC instead of XLM (wallets
need a USDC trustline; get test USDC from the Circle faucet).

### Environment variables

**verifier/.env**

| Var | Meaning |
|---|---|
| `RPC_URL`, `NETWORK_PASSPHRASE` | Stellar RPC endpoint and network |
| `CONTRACT_ID` | CampaignPool contract |
| `VERIFIER_SECRET` | Secret key of the address the contract trusts as verifier |
| `VIEW_PROVIDER` | `mock` (views grow `MOCK_VIEWS_PER_SECOND` from submission) or `youtube` |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key, for `youtube` |
| `REQUIRE_OWNERSHIP_TAG`, `REQUIRE_AD_DISCLOSURE` | Payout checks creators can fix (default on) |
| `MAX_VIEWS_PER_HOUR`, `MIN_LIKE_RATIO`, `MIN_VIEWS_FOR_ENGAGEMENT`, `MIN_CHANNEL_AGE_DAYS` | Anti-fraud thresholds that send a post to review |
| `REVIEW_TOKEN` | Bearer token for `POST /review/:id/:creator` (`{"approve": true}`) |
| `POLL_SECONDS`, `PORT` | Settlement interval and HTTP port |
| `SETTLE_PER_IP_PER_MINUTE` | Rate limit on `POST /settle/:id` |
| `TOKEN_ID` | Payout token SAC (withdrawals of it are sponsored) |
| `ACCOUNT_WASM_HASH`, `WEBAUTHN_VERIFIER`, `SMART_ACCOUNT_DEPLOYER` | Smart-account deployment the relay will sponsor |
| `SPONSOR_SECRET`, `SPONSOR_MAX_FEE_XLM` | Account that pays sponsored fees, and its per-tx cap |
| `SPONSOR_MIN_XLM`, `ALERT_WEBHOOK_URL` | Low-balance alert threshold and Slack/Discord webhook |
| `RELAY_PER_IP_PER_MINUTE`, `RELAY_PER_WALLET_PER_MINUTE` | Relay rate limits |
| `OZ_CHANNELS_URL`, `OZ_CHANNELS_API_KEY` | Forward sponsored txs to OpenZeppelin Channels instead |

**web/.env.local** — `VITE_RPC_URL`, `VITE_NETWORK_PASSPHRASE`, `VITE_CONTRACT_ID`,
`VITE_TOKEN_ID`, `VITE_TOKEN_SYMBOL`, `VITE_VERIFIER_URL`, `VITE_ACCOUNT_WASM_HASH`,
`VITE_WEBAUTHN_VERIFIER`, `VITE_ANCHOR_DOMAIN`.

## Demo script

1. Brand connects Freighter → **Launch a campaign** (e.g. 100 XLM budget, 0.5 XLM / 1k views, 20 XLM cap).
2. Creator opens the campaign → **Sign in** → **Create passkey wallet** (Touch ID) → submits a YouTube link. No extension, no fees.
3. Click **Verify views now** (or wait for the poll) → creator's row shows views and payout; the toast links to the tx.
4. Creator opens the wallet menu → **To bank** → passkey sign-in to the anchor → enters bank details on the anchor page → **Confirm with passkey** → anchor pays out.
5. After the deadline + grace, the brand clicks **Refund remaining**.

## Trust model & roadmap

The verifier is a single trusted key today — it can't take funds, only route the
brand's budget to submitted creators at the agreed rate and cap. The relay can only
spend its own fee balance, on the transaction types listed above, up to its fee cap.
Details: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md); operations (pausing, upgrades,
key rotation, sponsor top-ups): [docs/RUNBOOK.md](docs/RUNBOOK.md).

Testnet note: storage rent on testnet is currently very high. Uploading the 26 KB
contract Wasm cost ~7,400 XLM, a sponsored wallet deployment ~41 XLM, and a first
submission ~107 XLM of the sponsor's testnet XLM (two new 7-day entries); settlements
cost ~0.001 XLM. Mainnet rent is far lower; the relay's fee cap protects the sponsor
either way.

smart-account-kit and the relay are unaudited — testnet only. Next steps:

- Pay out in USDC and use a production anchor in the creators' countries
- Spending-limit policy on creator wallets (OZ policy contract) for safer withdrawals
- Multiple verifiers / oracle quorum, and TikTok + Instagram providers
- Brand-side dispute window before each payout

## Built during HackMeridian

Everything in this repository was written during the event (25–26 Oct 2026).
