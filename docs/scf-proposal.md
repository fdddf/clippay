# ClipPay — SCF Build Award proposal (draft)

Track: **Integration** · Category: End-User Application · Requested: **$62,000** ·
Duration: **17 weeks** · Team: 1 (solo builder, Germany) + contracted designer

> Draft for the full proposal after the interest form (submitted 2026-11-07, see
> [scf-interest.md](scf-interest.md)). `[DRAFT NOTE: …]` marks things only you can
> fill in or decide. Field names follow the usual SCF Build submission; paste each
> section into the matching field when the invite arrives.

---

## 1. One-liner

ClipPay lets brands pay short-form creators per 1,000 verified views from a Soroban
escrow, and creators get paid in USDC within seconds to a passkey wallet they can
cash out to a bank through a Stellar anchor.

## 2. Problem

"Clipping" and UGC campaigns pay short-form creators a rate per 1,000 views. The money
moves badly in both directions:

- **Brands** prepay an agency or platform and trust its view reports. Unspent budget
  usually stays with the intermediary, and view fraud is hard to check.
- **Creators**, many of them in LATAM, Southeast Asia and Africa, wait weeks for
  payouts, lose 5–10% to PayPal and wire fees, or can't receive at all where PayPal
  payouts are limited.

`[DRAFT NOTE: back this with 2–3 sources — e.g. creator-payout fee pages, a clipping
platform's payout terms, or quotes from creators you've talked to. Reviewers discount
unsourced market claims.]`

## 3. Solution

A brand locks a campaign budget in the `CampaignPool` Soroban contract and sets a rate
per 1k views, a cap per creator and a deadline. Creators submit their post. A verifier
reads the post's view count and runs fraud checks; the contract pays each creator what
they have earned since the last payout, minus a 5% platform fee. After the deadline
and a settlement grace period, the brand gets the unspent budget back. ClipPay never
holds the funds.

Creators need no crypto onboarding: they sign in with Face ID / Touch ID (an
OpenZeppelin smart account), every transaction they make is fee-sponsored, and they
cash out to a bank account through a SEP-24 anchor.

### Why Stellar

The product depends on four things Stellar has and other chains don't offer together:

1. **Anchors (SEP-24 / SEP-45)** — a creator in Brazil or the Philippines needs to end
   up with local currency in a bank account. Stellar's anchor network is the off-ramp;
   without it ClipPay is a crypto-only payout tool.
2. **Native USDC with sub-cent fees** — payouts are small and frequent (a creator may
   earn $3 in one settlement). Fees must stay negligible next to that.
3. **OpenZeppelin smart accounts with WebAuthn** — passkey wallets mean creators never
   see a seed phrase. Combined with fee sponsoring over the OpenZeppelin Relayer
   protocol, a creator needs no XLM at all.
4. **Soroban escrow** — the budget, rate, cap and payout rules are enforced on-chain,
   so neither side has to trust the other with money.

## 4. What exists today (built at HackMeridian, Oct 2026)

Everything below runs on testnet and is open source:
[github.com/fdddf/clippay](https://github.com/fdddf/clippay) ·
live app [clippay.hr.edu.kg](https://clippay.hr.edu.kg) ·
[demo video](https://youtu.be/f8TsMh9pCKw).

| Piece | State |
|---|---|
| `CampaignPool` contract v2 | Escrow, per-creator accounting, settlement, 5% fee (hard cap 20%, fixed per campaign), refunds, token allow-list, paged storage, owner-tunable rent policy. OpenZeppelin Ownable (two-step), Pausable (refunds keep working), Upgradeable (`upgrade` → `migrate`, done on testnet) |
| Tests | 24 contract tests incl. a 10,000-run property test of `Σ paid + Σ fees + remaining == budget`; a sync test keeps error codes, generated bindings and UI messages aligned; CI on every push |
| Verifier | YouTube Data API and mock providers; ownership tag, `#ad` disclosure, view-spike / low-engagement / new-channel flags hold posts for review |
| Fee relay | OpenZeppelin Relayer `{ func, auth }` protocol; allow-listed calls only, simulation checks, fee cap, per-IP and per-wallet rate limits; can forward to OZ Channels |
| Passkey wallets | smart-account-kit + OZ WebAuthn verifier; deployed and used through the public relay |
| Anchor cash-out | SEP-1 → SEP-45 (web auth for contract accounts) → SEP-24 → payment to a muxed `M…` address via the SAC's `MuxedAddress` transfer (CAP-67); completed on testanchor.stellar.org |
| Hosting | One Cloudflare Worker serves the app and `/api`; a Durable Object serializes transactions and settles every minute |
| Docs | Threat model, runbook, mainnet plan with blockers and a go/no-go checklist |

On-chain evidence (testnet):

- Contract: `CBYEMM7I4OXD5DTWGKCKT7NDLRB357W5Q32ZUX3Z7E5MQP37UQQYWVXT`
- Verifier settlement: `77c2cf1b0f74634b485715aaf1e6df350f0097bd6afecefd72a96e9dbefe3e20`
- Passkey wallet deployed through the relay: `58bb1d870f085e4430e71e2a9b0f26042c9fb205e243a7bc0cc4e3d6838a0164`
- Passkey-signed `submit` through the relay: `ca49f1e3823936f10341881515aa8c43f456dd19383994cc31ea2c79612fd557`
- SEP-24 bank cash-out, anchor status `completed`: `19d12e7070458c437ac5b487b2591d3829d40e5eaf6c97ac42baa1fd6bbf0a35`
- In-place `upgrade` → `migrate`: `e875011575e5ed561ca318a767cd372a5d25231f07b8e5641c72a608e6aa9d32`

**What's missing** (and what this award pays for): real view data in production,
less trust in a single verifier, a brand dispute window, production anchors, a
mainnet deployment with multisig ownership and monitoring, and real users.

## 5. Traction and demand

ClipPay has **no paying users yet**. It was built in October 2026 and has only run on
testnet with demo campaigns.

`[DRAFT NOTE: this is the weakest section and the one reviewers weigh most (Product
Market Fit). Before the submission deadline, try to get:
 - 2–3 letters of intent from brands willing to run a pilot campaign (Stellar
   ecosystem projects that need promotion are the easiest first asks);
 - 10–20 creators/clippers on a waitlist or a short call log ("would you take USDC
   payouts with bank cash-out?");
 - one anchor in a target country confirming SEP-24 USDC withdrawals are available.
Replace this paragraph with what you get, with links or names. Do not submit with
nothing here if you can avoid it.]`

**Targets**

| When | Target |
|---|---|
| End of T2 (testnet pilot) | 3 brands run campaigns with real YouTube data; ≥ 30 creators submit; every payout and refund reconciles on-chain |
| End of T3 (mainnet) | ≥ 3 brand campaigns funded in USDC on mainnet; ≥ 50 creators paid; ≥ 1 creator cash-out to a bank through a production anchor |
| 3 months after mainnet | ≥ 10 brands; ≥ 300 creators paid; ≥ $25,000 in creator payouts |

### Competition

Clipping and UGC payouts today run through platforms such as Whop's content rewards
and through agencies paying by PayPal or wire. They are custodial: the platform holds
the budget, reports the views and decides the payout. ClipPay's differences are an
on-chain escrow with automatic refunds, payouts within seconds rather than on a
weekly or monthly cycle, and a bank off-ramp in creators' own countries through
Stellar anchors. `[DRAFT NOTE: check current Whop/competitor payout terms and fees
before quoting any numbers.]`

### Business model

5% of each payout, taken by the contract at settlement. Nothing on deposits or
refunds. Network cost is about 0.001 XLM per payout; fee sponsoring for creators is
paid from the platform fee.

## 6. Technical architecture

```
 Brand (Freighter / Wallets Kit) ─create_campaign / top_up / refund─►┌──────────────────┐
                                                                      │  CampaignPool    │── USDC ─► creator smart account
 Creator (passkey smart account)                                      │  (Soroban)       │── fee ──► treasury
   │ WebAuthn-signed auth entry                                       │                  │── refund► brand
   ▼                                                                  └──────────────────┘
 Fee relay (OZ Relayer protocol) ── pays fee ── submit ──────────────────────▲
                                                                             │ settle(id, creator, views)
 Verifier(s) ── YouTube / TikTok views + fraud checks ── (T2: k-of-n) ───────┘
 Indexer ── contract events → D1 ── brand dashboard, creator earnings, alerts

 Creator smart account ── SEP-45 auth ── SEP-24 withdraw ── muxed M… transfer ──► Anchor ──► bank
```

### Contract (`contracts/campaign-pool`, Rust, soroban-sdk + OpenZeppelin stellar-contracts)

- **Brand:** `create_campaign`, `top_up`, `refund`
- **Creator:** `submit` (smart-account auth)
- **Verifier:** `settle(id, creator, views)` pays
  `min(views × rate / 1000, cap) − already_paid`, limited by the remaining budget;
  repeated counts pay nothing, counts can't go down
- **Owner:** `set_verifier`, `set_fee`, `allow_token` / `disallow_token`,
  `set_rent_policy`, `pause`, `upgrade` → `migrate`
- **Reads:** `get_campaign`, `get_submissions` (paged), `get_submission`, `earned`,
  `fee_bps`, `treasury`, `verifier`, `version`, `rent_policy`
- **State:** one instance entry for config; one persistent entry per campaign and per
  (campaign, creator) submission, so cost doesn't grow with the number of creators

**Planned contract changes (this award):**
- T1 — **settlement maturity + dispute window**: a settlement creates a pending amount
  that becomes payable after N hours; during that time the brand can dispute a
  creator, freezing their unpaid amount until the owner resolves it or it times out.
- T2 — **verifier set + threshold**: `settle` accepts a view count only when k of n
  registered verifiers report it (or a value within a tolerance); verifiers are
  managed by the owner with an upgrade timelock.

### Security

- Funds invariant property test, overflow checks in release builds, unauthorized-call
  tests for every owner function, frozen error codes.
- Mainnet blockers already written down in [MAINNET.md](MAINNET.md): owner moves to a
  multisig, upgrades go through a timelock, Wasm comes from a tagged SEP-55 release
  with a GitHub attestation, Scout runs in CI, the relay fee cap drops to the measured
  mainnet cost.
- Threat model: [THREAT_MODEL.md](THREAT_MODEL.md) (view farms, verifier key
  compromise, sponsor draining, owner key compromise, anchor failure).
- **Audit:** we will apply to the SDF Audit Bank after T2; audit cost is not in this
  budget.

## 7. Deliverables

Weeks are counted from the award start. `[DRAFT NOTE: convert to calendar dates once
you know the round — if invited to SCF #47, the award would start around
February 2027.]`

### Tranche 1 — MVP (weeks 1–5)

**Deliverable 1.1 — Production view data and durable review state**
- **Description:** YouTube Data API provider running in the deployed verifier with
  quota handling; the mock provider refuses to start when `NETWORK=mainnet`. Post
  statuses, fraud holds and reviewer decisions move from Durable Object memory into
  D1, so a restart never pays a rejected post.
- **Completion criteria:** testnet campaign settles from live YouTube view counts
  (settlement tx linked); a test restarts the Durable Object and shows a rejected post
  stays unpaid; CI green.
- **Estimated completion:** week 2
- **Budget:** $6,000

**Deliverable 1.2 — Contract v3: settlement maturity and brand dispute window**
- **Description:** pending payouts mature after a configurable delay; brands can
  dispute a creator during that window, freezing the unpaid amount; disputes resolve
  by owner decision or time out. Brand UI to open a dispute; creator UI shows pending
  vs. paid.
- **Completion criteria:** contract v3 deployed to testnet via `upgrade` → `migrate`
  (tx linked); unit and property tests cover dispute, timeout and the funds invariant
  with disputes; demo of a disputed payout in the live app.
- **Estimated completion:** week 4
- **Budget:** $6,000

**Deliverable 1.3 — USDC by default and multi-wallet brands**
- **Description:** new campaigns default to the USDC SAC; the brand flow checks and
  adds trustlines; brands can connect with Stellar Wallets Kit (Freighter, xBull,
  Lobstr, Albedo).
- **Completion criteria:** a USDC campaign created, settled and refunded on testnet
  (txs linked); at least 3 wallets complete `create_campaign`.
- **Estimated completion:** week 5
- **Budget:** $3,000

### Tranche 2 — Testnet (weeks 6–11)

**Deliverable 2.1 — Multi-verifier settlement**
- **Description:** verifier set + threshold in the contract; two independent verifier
  instances (different keys and hosting) report views; settlement only when the
  threshold is met. Upgrade timelock for owner actions that change the verifier set.
- **Completion criteria:** testnet settlement signed off by 2-of-2 or 2-of-3 verifiers
  (tx linked); test showing a single verifier cannot settle; design note in `docs/`.
- **Estimated completion:** week 8
- **Budget:** $7,500

**Deliverable 2.2 — Indexer, earnings history and monitoring**
- **Description:** contract events indexed into D1 so history outlives RPC retention;
  creator earnings page across campaigns; brand CSV export; alerts on owner actions,
  pause changes, large transfers, settlement failures, low sponsor balance and TTLs
  near expiry.
- **Completion criteria:** settlement records older than 7 days queryable in the app;
  a test alert delivered for each rule; alert rules documented in the runbook.
- **Estimated completion:** week 10
- **Budget:** $6,000

**Deliverable 2.3 — Audit readiness and testnet pilot**
- **Description:** owner moved to a multisig on the staging contract; SEP-55 contract
  metadata and a GitHub attestation release workflow; Scout in CI; audit scope
  document; Audit Bank application. Run a testnet pilot with design-partner brands
  using real YouTube data.
- **Completion criteria:** on-chain owner is the multisig (tx linked); release Wasm
  hash matches the attestation; Scout passes in CI; pilot report with ≥ 3 brand
  campaigns and ≥ 30 creator submissions on testnet, published in `docs/`.
- **Estimated completion:** week 11
- **Budget:** $4,500

`[DRAFT NOTE: TikTok/Instagram view providers are left out on purpose — TikTok's
public APIs only expose view counts through creator OAuth, which needs app review.
Add them as a stretch goal only if you've confirmed API access.]`

### Tranche 3 — Mainnet (weeks 12–17)

**Deliverable 3.1 — Mainnet deployment**
- **Description:** `CampaignPool` deployed to mainnet from a tagged release following
  the go/no-go checklist in [MAINNET.md](MAINNET.md): multisig owner, mainnet-only
  verifier and sponsor keys, relay fee cap and per-wallet budget set from measured
  costs, separate Worker and D1, mainnet passkey wallet infrastructure confirmed.
- **Completion criteria:** mainnet contract ID and stellar.expert link in the README
  and deployment log; smoke test (create → submit → settle → refund) with a small
  USDC budget, txs linked; alerts firing on mainnet.
- **Estimated completion:** week 13
- **Budget:** $6,000

**Deliverable 3.2 — Production anchor cash-out**
- **Description:** ClipPay `stellar.toml` (SEP-1) and SEP-45 `client_domain`
  signing; at least one production SEP-24 USDC anchor serving a target country
  (LATAM first); SEP-38 quote shown before withdrawal.
- **Completion criteria:** a real creator withdrawal completed to a bank account
  through the production anchor (tx and anchor status linked, personal data
  redacted).
- **Estimated completion:** week 15
- **Budget:** $5,500
- `[DRAFT NOTE: name the anchor(s) once one confirms; this is a dependency outside
  your control, so ask early.]`

**Deliverable 3.3 — UX readiness and mainnet pilot**
- **Description:** onboarding for brands (campaign wizard, pricing page, fee
  breakdown) and creators (passkey sign-in, payout status, cash-out guide) reviewed
  by a contracted designer; Spanish and Portuguese UI; all testnet wording driven by
  config; user docs. Mainnet pilot with design-partner brands.
- **Completion criteria:** ≥ 3 brand campaigns funded in USDC on mainnet; ≥ 50
  creators paid (contract events linked); usability check with 5 creators and
  2 brands written up in `docs/`; app available in EN / ES / PT.
- **Estimated completion:** week 17
- **Budget:** $17,500 (incl. designer, translation, infra and fee sponsoring; see
  budget)

## 8. Budget

Bottom-up from the deliverables. Builder rate: **$3,000 / week** (full-stack + Soroban;
benchmark range $2,000–$5,000). Audit, legal review and marketing are not included.

| Line | Deliverable(s) | Rate | Effort | Cost |
|---|---|---|---|---|
| Soroban + full-stack development | 1.1–1.3 | $3,000/wk | 5 wks | $15,000 |
| Soroban + full-stack development | 2.1–2.3 | $3,000/wk | 6 wks | $18,000 |
| Soroban + full-stack development | 3.1–3.3 | $3,000/wk | 6 wks | $18,000 |
| UI/UX designer (contract) | 3.3 | $2,000/wk | 3 wks | $6,000 |
| Spanish + Portuguese translation and review | 3.3 | fixed | — | $1,500 |
| Infrastructure: Cloudflare Workers/D1, mainnet RPC provider, YouTube API quota | all | ~$300/mo | 5 mo | $1,500 |
| Fee sponsoring and rent float for the mainnet pilot (XLM) | 3.1, 3.3 | fixed | — | $2,000 |
| **Total** | | | | **$62,000** |

Development is 82% of the budget; no single non-development line exceeds 10%.

### Tranches

| Tranche | Share | Amount | Released when |
|---|---|---|---|
| T0 | 10% | $6,200 | Award approval |
| T1 — MVP | 20% | $12,400 | Deliverables 1.1–1.3 verified |
| T2 — Testnet | 30% | $18,600 | Deliverables 2.1–2.3 verified |
| T3 — Mainnet | 40% | $24,800 | Deliverables 3.1–3.3 verified |

`[DRAFT NOTE: $62K is below the Applications median ($85K) on purpose — a solo
team asking for more invites "can one person ship this?" questions. If you add a
second developer, scale up rather than stretching the timeline.]`

## 9. Team

**`[DRAFT NOTE: your name]`** — solo founder and developer, based in Germany
(team name "The bug leader"). Full-stack developer across Rust / Soroban smart
contracts, TypeScript and React, and Cloudflare Workers. Built all of ClipPay during
HackMeridian 2026: contract and property tests, verifier and fee relay, SEP-45 /
SEP-24 anchor integration, web app, deployment, docs and demo video.
GitHub: [github.com/fdddf](https://github.com/fdddf).

`[DRAFT NOTE: reviewers score team capability. Add: your real name, years of
experience, previous products or employers, LinkedIn or personal site, and anything
you've shipped to production. Anonymous solo teams score poorly.]`

**Contracted:** a UI/UX designer for 3 weeks in T3 `[DRAFT NOTE: name them if you
can]`.

**How a solo team delivers:** the codebase, CI, runbook and mainnet checklist already
exist, so the award is spent hardening and launching rather than building from zero;
every deliverable is small enough to verify on its own; the code is open source, so
the work isn't lost if the project stops.

## 10. Integration track — building blocks used

| Building block | How ClipPay uses it |
|---|---|
| OpenZeppelin smart accounts + WebAuthn verifier (via smart-account-kit) | Creator passkey wallets |
| OpenZeppelin Relayer / Channels | Fee sponsoring for every creator transaction |
| OpenZeppelin stellar-contracts (Ownable, Pausable, Upgradeable) | Contract admin and upgrade path |
| Stellar anchors: SEP-1, SEP-45, SEP-24, SEP-38 | Bank cash-out from a contract account |
| USDC Stellar Asset Contract | Campaign budgets and payouts |
| Stellar Wallets Kit / Freighter | Brand wallets |

## 11. AI tooling disclosure

Claude Code (Anthropic) was used as a pair programmer throughout: contract and tests,
verifier, relay, anchor client, web app, scripts, CI, docs, the pitch deck and this
proposal. Architecture decisions, deployments and on-chain transactions were directed
and checked by the builder. The demo video's narration was generated with Kokoro TTS.

---

## Strengths and gaps (review before submitting)

**Strengths**
- Stellar is essential, not bolted on: anchors, USDC, passkey smart accounts and
  Soroban escrow are each load-bearing.
- A working testnet product with on-chain evidence, tests and a written mainnet plan —
  most of the "Ready to Build" criterion is already met.
- Deliverables are small, externally verifiable and trace to a bottom-up budget below
  the category median.

**Gaps**
1. **No demand evidence** (section 5). Biggest risk. Brand LOIs and a creator
   waitlist would change the outcome more than anything else here.
2. **Anonymous solo team** (section 9). Add your name and verifiable history.
3. **Production anchor dependency** (3.2). Line up an anchor before submitting.
4. **Verifier trust** stays partly centralized even with 2-of-n verifiers you
   operate; say so plainly if a reviewer asks, and mention zkTLS view proofs as later
   work rather than promising them now.
5. **Market claims are unsourced** (section 2).
