# ClipPay threat model

Scope: CampaignPool v2 (`contracts/campaign-pool`), the verifier + relay service
(`verifier/`), the web app (`web/`) and the anchor integration (`packages/anchor`).
Status: testnet. Nothing here has been audited yet.

## Assets

| Asset | Where it lives | Who can move it |
|---|---|---|
| Campaign budgets | CampaignPool contract balance | `settle` (verifier) → creator + treasury; `refund` (brand, after settlement closes) |
| Creator earnings | Creator's smart account (`C…`) | The creator's passkey |
| Platform fees | Treasury account | Treasury key |
| Sponsor XLM | Sponsor account | The relay, only as transaction fees |

The platform never holds brand or creator money in an account it controls: budgets sit
in the contract, payouts go straight to creators.

## Roles and what each can do

| Role | Key | Can | Cannot |
|---|---|---|---|
| Owner | `clippay-admin` (move to a multisig before mainnet) | pause/unpause, upgrade + migrate, set verifier, fee (≤ 20%) and treasury, allow/disallow tokens, set rent policy, transfer ownership (two-step) | Move campaign funds directly; change a live campaign's fee |
| Verifier | `VERIFIER_SECRET` (production: `clippay-verifier-prod`, Worker secret) | Report view counts → pay creators at the campaign's rate, up to the per-creator cap and the remaining budget | Pay anyone who didn't submit; exceed rate or cap; lower a reported count; settle after the grace window |
| Brand | Their wallet | Create, top up, refund after settlement closes | Refund early; claw back settled payouts |
| Creator | Passkey | Submit once per campaign; spend their own balance | Settle their own views |
| Relay sponsor | `SPONSOR_SECRET` | Pay fees for allow-listed calls | Spend for anything else (auth entries must be address-signed; host function allow-list; fee cap; rate limits) |

## Threats

| # | Threat | Impact | Mitigation today | Planned |
|---|---|---|---|---|
| T1 | **Fake views** (bots, view farms) drain a budget | High | Per-creator cap; payout checks (ownership tag, #ad, view-spike, engagement, channel-age) hold suspicious posts for review | Settlement maturity + brand dispute window (P1-C7); multi-source view data |
| T2 | **Verifier key leak** | High | Contract caps the damage: only submitted creators, only at the campaign rate, up to the cap; owner can `set_verifier` (rotation exercised once) or `pause`; production key lives only in Worker secrets | 2-of-3 verifier quorum (P1-V5); KMS |
| T3 | **Owner key leak** | High | Owner cannot move campaign funds; fee hard-capped at 20% and fixed per campaign; refunds work while paused | Multisig owner; upgrade timelock |
| T4 | **Malicious upgrade** | High | Owner-only; `version()` + `migrate` are on-chain and visible; error codes frozen | SEP-55 verifiable builds so every Wasm hash maps to a commit; timelock |
| T5 | **Sponsor drained** | Medium | Host-function allow-list, address-only auth, simulation before paying, per-tx fee cap, per-IP and per-wallet rate limits, low-balance alert | Move to OZ Channels; per-wallet daily budget |
| T6 | **Creator claims someone else's post** | Medium | Ownership tag in the description must match the first 16 characters of the creator's address (~2^72 to grind a matching one); one payee per post per campaign: later entries of a post already claimed are held for review | OAuth channel binding (P2-5) |
| T6b | **Old post entered for its back catalogue of views** (views are paid from zero) | High | Posts published before the campaign started are held for review; the start comes from the indexed `campaign_created` event, or the campaign's first entry as an upper bound when that isn't indexed | Record `created_at` on-chain in the next contract upgrade |
| T7 | **Storage archival** of a long campaign | Medium | Entries extended to end of settlement + margin; instance renewed at half-life; anyone can call `extend` | Monitoring of TTLs (P1-B4) |
| T8 | **Unbounded storage / fee griefing** (many creators) | Medium | One fixed-size entry per creator; submit cost independent of creator count (tested at 200+); reads paged (≤ 50) | — |
| T9 | **Fee-on-transfer or malicious token** | Medium | Token allow-list (owner); decimals recorded per campaign | — |
| T10 | **Undisclosed sponsorship** (FTC etc.) | Legal | `#ad` / `#sponsored` required before payout | Per-region rules |
| T11 | **Anchor risk** (withdrawal not honoured) | Medium | SEP-24 status polling; funds only leave the wallet after the creator confirms the anchor's quote | Production anchors vetted per country (P2-3) |
| T12 | **Smart-account / relay code unaudited** | High | Testnet only | Audit before mainnet (P2-1) |

## Trust assumptions

1. The verifier reports honest view counts. The contract limits, but cannot detect, lies.
2. The owner key is held safely and acts in good faith (single key on testnet).
3. View platforms' public APIs are accurate.
4. The anchor completes withdrawals it accepts.

## Out of scope (for now)

Front-end supply chain, DNS/hosting compromise, phishing of creators' passkeys, and
legal classification of the platform fee.
