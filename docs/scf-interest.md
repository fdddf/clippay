# SCF Build Award — interest form (ClipPay)

The answers entered in the SCF Build Interest Form (communityfund.stellar.org →
Dashboard → My Projects → Indicate your interest; Discord sign-in). Character limits:
description 1100, traction 1000, integration 1100 (counted after formatting).

| Field | Value |
|---|---|
| Project Title | ClipPay |
| Project Category | End-User Application |
| Website | https://clippay.hr.edu.kg |
| Build Track | Integration Track |
| Submitter type | Individual |
| Email | the account's email (prefilled, read-only) |
| Target markets | United States, European Union, United Kingdom, Nigeria, Kenya, Brazil, Hong Kong, Southeast Asia, Middle East & North Africa, Sub-Saharan Africa (other), Latin America (other) |
| Team based in | European Union (Germany) |
| Local currencies / payment rails | Yes |
| Product type | Non-custodial wallet with bundled exchange, swap, or on/off-ramp functionality; Payments product |
| Nigeria-linked transactions | Not sure yet (explanation below) |
| Referral | No |

Submitted 2026-11-07; the site confirmed "Interest form successfully submitted."

## Nigeria explanation

ClipPay has no Naira-pegged assets and no direct integration with Nigerian banks or mobile money. Creators in Nigeria would be paid in USDC and could cash out through a third-party Stellar anchor (SEP-24) if one offering NGN payouts is integrated later. Guidance on any requirements for that case is welcome.

## Project Description

ClipPay is a pay-per-view bounty platform for short-form creators, built on Stellar. Clipping and UGC campaigns pay creators per 1,000 views; many of them live in LATAM, Southeast Asia and Africa, where payouts take weeks, lose 5-10% to fees, or can't be received at all. Brands prepay agencies and hope the views are real.

A brand locks its budget in a Soroban escrow with a rate per 1k views and a cap per creator. A verifier reads view counts and runs fraud checks; the contract pays each creator what they've earned since the last payout, in seconds, and refunds unspent budget after the deadline. Creators sign in with Face ID (OpenZeppelin smart account), pay no fees, and cash out to a bank through an anchor. ClipPay earns 5% of verified payouts and never holds funds.

Goals: a USDC pilot with design-partner brands, TikTok/Instagram support, multi-verifier or zkTLS view proofs, an audit, and mainnet with local anchors.

## Current Traction

Working testnet product built at HackMeridian (Oct 2026). No paying users yet; next is a USDC pilot with 2-3 design-partner brands.
Live app: https://clippay.hr.edu.kg
Code + CI: https://github.com/fdddf/clippay (24 contract tests incl. a 10,000-run funds-invariant property test)
Demo: https://youtu.be/f8TsMh9pCKw
Testnet evidence (full list in the README):
Contract CBYEMM7I4OXD5DTWGKCKT7NDLRB357W5Q32ZUX3Z7E5MQP37UQQYWVXT
Verifier settlement tx 77c2cf1b0f74634b485715aaf1e6df350f0097bd6afecefd72a96e9dbefe3e20
Passkey wallet via fee relay tx 58bb1d870f085e4430e71e2a9b0f26042c9fb205e243a7bc0cc4e3d6838a0164
SEP-24 bank cash-out (completed) tx 19d12e7070458c437ac5b487b2591d3829d40e5eaf6c97ac42baa1fd6bbf0a35

## Planned Stellar Integration

Already built on testnet:
(1) Soroban CampaignPool contract (soroban-sdk + OpenZeppelin stellar-contracts): escrows the brand's budget in an allow-listed SEP-41 token (USDC/XLM SACs), pays min(views x rate/1000, cap) minus prior payouts on each verifier settlement, takes a fixed fee and refunds unspent budget. Ownable, Pausable, Upgradeable.
(2) OpenZeppelin smart accounts + WebAuthn verifier: passkey wallets for creators.
(3) Fee sponsoring over the OpenZeppelin Relayer (Channels) protocol, locked down so it can't be drained.
(4) Anchor cash-out for contract accounts: SEP-45 web auth + SEP-24 withdrawal, paid to a muxed M... address via the SAC MuxedAddress transfer (CAP-67).
(5) Freighter for brands; contract events for indexing.
Planned: USDC payouts by default, production anchors in LATAM/SEA/Africa, multi-verifier settlement, OZ spending-limit policies on creator wallets, mainnet after an audit.

## Team Description

Solo builder (team name "The bug leader"), based in Germany. Full-stack developer working across Rust / Soroban smart contracts, TypeScript and React front ends, and Cloudflare Workers back ends. I built ClipPay end to end during HackMeridian 2026: the Soroban contract and its property tests, the verifier and fee relay, the SEP-45 / SEP-24 anchor integration, the web app, deployment, docs and demo video. GitHub: https://github.com/fdddf
