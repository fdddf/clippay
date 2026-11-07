# HackMeridian submission form — ClipPay

Copy each block into the matching field. Character counts are checked against the
form limits (tagline ≤ 120, description ≤ 8000).

---

## Project title

```
ClipPay
```

## Tagline

```
Pay-per-view creator bounties on Stellar: brands escrow the budget, creators get paid in seconds with a passkey.
```

## Description

```markdown
**ClipPay** is a pay-per-view bounty platform for short-form creators, built on Stellar. A brand locks its budget in a Soroban contract and sets a rate per 1,000 views. Creators submit their post; a verifier reads the view count and the contract pays each creator what they have earned since the last payout — in seconds, for a fraction of a cent. When the campaign ends, the unearned budget goes back to the brand. Nobody has to trust the other side with money.

**Live demo (testnet):** https://clippay.hr.edu.kg — open a campaign → Sign in → Create passkey wallet (Face ID / Touch ID) → paste any YouTube link → Verify views now. No wallet extension, no XLM for fees.

### What a creator sees
- **Sign in with a passkey.** That creates an OpenZeppelin smart account secured by WebAuthn — no seed phrase, no extension.
- **No fees.** Every creator transaction is fee-sponsored by our relay, which speaks the OpenZeppelin Relayer (Channels) `{ func, auth }` protocol.
- **Paid in seconds** to their smart-account address, with a link to each on-chain payout.
- **Cash out to a bank** through a Stellar anchor (SEP-24), or send to any Stellar address.

### What a brand sees
- Launch a campaign with Freighter: budget, rate per 1k views, cap per creator, deadline.
- Live budget, cost per 1k views, fee breakdown, and why any post is on hold.
- **Refund remaining** after the deadline plus a settlement grace period.

### How it works
- **CampaignPool contract (Rust / Soroban).** `create_campaign` escrows the brand's SEP-41 tokens (allow-listed XLM / USDC SACs). `settle(id, creator, views)` — callable only by the verifier — pays `min(views × rate / 1000, cap) − already_paid`, limited by the remaining budget. Repeating a view count pays nothing; counts can't go down. A 5% platform fee (fixed per campaign, hard-capped at 20%) goes to the treasury. OpenZeppelin Ownable (two-step), Pausable (refunds keep working while paused) and Upgradeable (`upgrade` → `migrate`, demonstrated on testnet).
- **Funds invariant**: `Σ paid + Σ fees + remaining == budget`, checked by a property test over 10,000 random runs. 24 contract tests in total; error codes are frozen and checked against the generated bindings and the web app's messages.
- **Verifier** reads views (YouTube Data API or a mock provider), runs payout checks — ownership tag in the description, `#ad` disclosure, anti-fraud flags for view spikes, low engagement and new channels — and holds suspicious posts for review before settling.
- **Runs on Cloudflare Workers**: one Worker serves the React app and `/api`; a Durable Object runs the verifier and relay, sends transactions one at a time and settles every campaign once a minute.

### Stellar building blocks composed
1. **Soroban smart contract** holding the escrow and enforcing payouts
2. **OpenZeppelin smart accounts + WebAuthn verifier** (via `smart-account-kit`) for passkey wallets
3. **Fee sponsoring** with the OpenZeppelin Relayer protocol (own sponsor, or forward to OZ Channels)
4. **Anchor cash-out**: SEP-1 → **SEP-45** (web auth for contract accounts) → **SEP-24** interactive withdrawal → a muxed `M…` destination paid with the SAC's `transfer(from, to: MuxedAddress, amount)` (CAP-67), because a contract account can't attach a memo
5. **Stellar Asset Contract** (XLM / USDC as SEP-41 tokens), **Freighter** for brands, contract events for indexing

### On-chain evidence (testnet)
- CampaignPool v2: `CBYEMM7I4OXD5DTWGKCKT7NDLRB357W5Q32ZUX3Z7E5MQP37UQQYWVXT`
- Settlement by the deployed verifier: `77c2cf1b0f74634b485715aaf1e6df350f0097bd6afecefd72a96e9dbefe3e20`
- Passkey wallet deployed through the public relay: `58bb1d870f085e4430e71e2a9b0f26042c9fb205e243a7bc0cc4e3d6838a0164`
- Passkey-signed `submit` through the relay: `ca49f1e3823936f10341881515aa8c43f456dd19383994cc31ea2c79612fd557`
- Bank cash-out payment (SEP-24, muxed) → anchor status `completed`: `19d12e7070458c437ac5b487b2591d3829d40e5eaf6c97ac42baa1fd6bbf0a35`
- In-place `upgrade` → `migrate` on a staging contract: `e875011575e5ed561ca318a767cd372a5d25231f07b8e5641c72a608e6aa9d32`

All contract IDs and links are in the README; the threat model and runbook are in `docs/`.

### Business model
5% of each payout, so ClipPay earns only when a creator is paid for a verified view. Nothing on deposits or refunds; about 0.001 XLM network cost per payout.
```

## Problem solved

```
"Clipping" and UGC campaigns pay short-form creators per 1,000 views, and a growing share of those creators live in LATAM, Southeast Asia and Africa. The money moves badly in both directions. Brands prepay agencies or platforms and hope the views are real. Creators wait weeks for payouts, lose 5–10% to PayPal and wire fees, or can't receive at all.

ClipPay fixes both sides. Brands keep their budget in a Soroban escrow they can see, pay only for verified views at the rate and cap they set, and get the unspent budget back automatically. Creators are paid within seconds of a verification, with no crypto onboarding: they sign in with Face ID or Touch ID, never hold XLM for fees, and can cash out to a bank account through a Stellar anchor. Every payout is an on-chain record both sides can check, and the platform never takes custody of the funds.
```

## Challenges

```
- Testnet storage rent. In October 2026 uploading our 26 KB contract cost ~7,400 XLM, and tying the instance TTL to the campaign length made a single create_campaign cost ~28,000 XLM. We separated the two: campaign entries live until settlement ends plus a margin, the instance renews at half-life, and both are owner-tunable (set_rent_policy) since testnet and mainnet rent differ by orders of magnitude. We upgrade in place instead of redeploying.

- Cashing out from a contract account. Passkey wallets are C… addresses, but SEP-10 only authenticates G… accounts, and a contract account can't attach the memo an anchor uses to match the payment. We implemented SEP-45 (validating the anchor's web_auth_verify entries and signing ours with the passkey), and encoded the anchor's memo into a muxed M… destination paid with the SAC's MuxedAddress transfer (CAP-67). The full SEP-24 flow completes on testanchor.stellar.org.

- A fee sponsor that can't be drained. The relay accepts only CampaignPool calls, payout-token transfers and smart-account deployments with the expected Wasm hash, rejects source-account auth, simulates with the signed entries, caps the fee and rate-limits per IP and wallet. It speaks the OpenZeppelin Relayer protocol, so it can forward to OZ Channels instead.

- Proving the money is safe. A property test runs 10,000 random campaigns and checks that paid + fees + remaining always equals the budget and that no post exceeds its cap. A sync test fails if contract error codes, bindings and UI messages drift apart.

- Running unattended. Local and deployed verifiers collided on sequence numbers, so the Worker signs with its own verifier key, and a Durable Object serializes transactions and settles from its own alarm.

- Testing real passkey flows end to end. We used a software passkey and Chrome's virtual WebAuthn authenticator, so the e2e scripts and demo video run real testnet transactions.
```

## What's next

```
- Pilot (2–6 weeks): three design-partner brands, real YouTube view data with the fraud checks on, USDC payouts, and an SCF application.
- More platforms: TikTok and Instagram view providers.
- Less trust in one verifier: multiple verifiers / an oracle quorum, and a brand-side dispute window before each payout.
- Safer creator wallets: an OpenZeppelin spending-limit policy on withdrawals.
- Mainnet beta (2–3 months): a security audit of the contract and relay, and production anchors that pay out in creators' countries (LATAM, Southeast Asia, Africa).
```

## Repository link

```
https://github.com/fdddf/clippay
```

## Project website link

```
https://clippay.hr.edu.kg
```

## Demo video link

```
https://youtu.be/f8TsMh9pCKw
```

## Deck file

Export the 10-slide deck as PDF from the Slides artifact
(<https://claude.ai/artifact/TP72iKFWvUCQPgvMxvBcGR>, Share › Export › PDF) and upload it.

## Thematic track

```
Stellar Composed
```

It combines OpenZeppelin smart accounts (passkeys), fee sponsoring over the OpenZeppelin
Relayer protocol, a Stellar anchor (SEP-45 + SEP-24), SACs and Freighter around one
Soroban escrow — the "From onchain to the bank" and "Wallets people want to use" ideas.

## Tech stack

```
rust, soroban, soroban-sdk, openzeppelin-stellar-contracts, smart-account-kit, stellar-sdk, stellar-cli, freighter, webauthn, sep-24, sep-45, typescript, react, vite, node.js, cloudflare-workers, durable-objects, youtube-data-api, pnpm, playwright, remotion
```

## Prior work disclosure

```
None. Everything in the repository — contract, verifier, relay, anchor client, web app, scripts, docs, deck and demo video — was written during HackMeridian (25–26 October 2026); the git history starts on 25 October. We build on open-source libraries and public testnet services we did not write: soroban-sdk, OpenZeppelin stellar-contracts (Ownable, Pausable, Upgradeable, smart accounts, WebAuthn verifier), smart-account-kit, @stellar/stellar-sdk, Freighter, Stellar's test anchor (testanchor.stellar.org), and Cloudflare Workers. The three demo campaigns are from fictional brands.
```

## AI tooling note

```
Claude Code (Anthropic, Claude Opus models) was used throughout as a pair programmer. It helped write and debug the Soroban contract and its tests (including the funds property test), the verifier, relay and anchor (SEP-45 / SEP-24) client, the React web app, deploy and seed scripts, CI, and the README, threat model and runbook. It also drafted the product and UX plans and the pitch deck (Claude's Slides artifact). All architecture decisions, testnet deployments and on-chain transactions were directed and checked by the builder.

The demo video narration was generated locally with Kokoro TTS (voice am_liam); footage was recorded from the live site with Playwright and composed with Remotion.
```
