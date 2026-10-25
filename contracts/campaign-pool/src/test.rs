#![cfg(test)]
extern crate std;

use super::*;
use proptest::prelude::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, InvokeError, String,
};

const GRACE: u64 = 3_600;
const T0: u64 = 1_000_000;
const FEE_BPS: u32 = 500;
const DAY: u64 = 86_400;
/// `pausable::PausableError::EnforcedPause`
const ENFORCED_PAUSE: u32 = 1000;

struct Setup<'a> {
    env: Env,
    pool: CampaignPoolClient<'a>,
    token: TokenClient<'a>,
    owner: Address,
    brand: Address,
    verifier: Address,
    treasury: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);

    let owner = Address::generate(&env);
    let verifier = Address::generate(&env);
    let treasury = Address::generate(&env);
    let brand = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(owner.clone());
    StellarAssetClient::new(&env, &sac.address()).mint(&brand, &1_000_000);
    let token = TokenClient::new(&env, &sac.address());

    let pool_id = env.register(
        CampaignPool,
        (
            owner.clone(),
            verifier.clone(),
            treasury.clone(),
            FEE_BPS,
            GRACE,
            vec![&env, sac.address()],
        ),
    );
    let pool = CampaignPoolClient::new(&env, &pool_id);

    Setup {
        env,
        pool,
        token,
        owner,
        brand,
        verifier,
        treasury,
    }
}

/// Budget 100,000, 100 per 1k views, cap 30,000 per creator, ends in a day.
fn create(s: &Setup) -> u32 {
    create_with(s, 100_000, 30_000, T0 + DAY)
}

fn create_with(s: &Setup, budget: i128, cap: i128, deadline: u64) -> u32 {
    s.pool.create_campaign(
        &s.brand,
        &s.token.address,
        &String::from_str(&s.env, "Launch clip"),
        &String::from_str(&s.env, "https://example.com/brief"),
        &budget,
        &100,
        &cap,
        &deadline,
    )
}

fn url(env: &Env) -> String {
    String::from_str(env, "https://youtu.be/dQw4w9WgXcQ")
}

fn creator(s: &Setup, id: u32) -> Address {
    let who = Address::generate(&s.env);
    s.pool.submit(&id, &who, &url(&s.env));
    who
}

fn contract_error<T, E: core::fmt::Debug>(r: Result<T, Result<E, InvokeError>>) -> Option<u32> {
    match r {
        Err(Err(InvokeError::Contract(code))) => Some(code),
        _ => None,
    }
}

// ------------------------------------------------------------- campaigns

#[test]
fn create_locks_budget() {
    let s = setup();
    let id = create(&s);
    assert_eq!(id, 0);
    assert_eq!(s.pool.campaign_count(), 1);
    assert_eq!(s.token.balance(&s.brand), 900_000);
    assert_eq!(s.token.balance(&s.pool.address), 100_000);

    let c = s.pool.get_campaign(&id);
    assert_eq!(c.remaining, 100_000);
    assert_eq!(c.decimals, 7);
    assert_eq!(c.fee_bps, FEE_BPS);
    assert_eq!(c.creators, 0);
    assert!(!c.refunded);
}

#[test]
fn settle_pays_the_delta_minus_fee() {
    let s = setup();
    let id = create(&s);
    let who = creator(&s, id);

    // 5,000 views at 100/1k = 500: 25 to the treasury, 475 to the creator
    assert_eq!(s.pool.settle(&id, &who, &5_000), 475);
    // the verifier signed the settlement
    assert_eq!(s.env.auths()[0].0, s.verifier);
    assert_eq!(s.token.balance(&who), 475);
    assert_eq!(s.token.balance(&s.treasury), 25);

    // same count again pays nothing
    assert_eq!(s.pool.settle(&id, &who, &5_000), 0);
    // 12,000 views → earned 1,200, already settled 500
    assert_eq!(s.pool.settle(&id, &who, &12_000), 665);
    assert_eq!(s.token.balance(&who), 1_140);
    assert_eq!(s.token.balance(&s.treasury), 60);

    let sub = s.pool.get_submission(&id, &who);
    assert_eq!(sub.views, 12_000);
    assert_eq!(sub.paid, 1_140);
    assert_eq!(sub.fee, 60);
    let c = s.pool.get_campaign(&id);
    assert_eq!(c.remaining, 98_800);
    assert_eq!(c.fees, 60);
}

#[test]
fn settle_respects_cap_and_budget() {
    let s = setup();
    let id = create(&s);
    let all = [
        creator(&s, id),
        creator(&s, id),
        creator(&s, id),
        creator(&s, id),
    ];

    // 1M views would earn 100,000 — capped at 30,000 each (fee included)
    for who in &all[..3] {
        assert_eq!(s.pool.settle(&id, who, &1_000_000), 28_500);
    }
    // only 10,000 left in the pool
    assert_eq!(s.pool.settle(&id, &all[3], &1_000_000), 9_500);
    let c = s.pool.get_campaign(&id);
    assert_eq!(c.remaining, 0);
    assert_eq!(c.fees, 5_000);
    assert_eq!(s.token.balance(&s.pool.address), 0);
    assert_eq!(s.token.balance(&s.treasury), 5_000);
}

#[test]
fn huge_view_counts_saturate_at_the_cap() {
    let s = setup();
    let id = create(&s);
    let who = creator(&s, id);
    assert_eq!(s.pool.settle(&id, &who, &u64::MAX), 28_500);
}

#[test]
fn views_cannot_go_down() {
    let s = setup();
    let id = create(&s);
    let who = creator(&s, id);
    s.pool.settle(&id, &who, &5_000);
    assert_eq!(
        s.pool.try_settle(&id, &who, &4_000),
        Err(Ok(Error::ViewsDecreased))
    );
}

#[test]
fn submit_rules() {
    let s = setup();
    let id = create(&s);
    let who = creator(&s, id);
    assert_eq!(
        s.pool.try_submit(&id, &who, &url(&s.env)),
        Err(Ok(Error::AlreadySubmitted))
    );
    assert_eq!(
        s.pool.try_settle(&id, &Address::generate(&s.env), &1),
        Err(Ok(Error::SubmissionNotFound))
    );

    s.env.ledger().set_timestamp(T0 + DAY + 1);
    assert_eq!(
        s.pool
            .try_submit(&id, &Address::generate(&s.env), &url(&s.env)),
        Err(Ok(Error::CampaignEnded))
    );
    assert_eq!(s.pool.get_submissions(&id, &0, &10).len(), 1);
}

#[test]
fn refund_after_grace_closes_settlement() {
    let s = setup();
    let id = create(&s);
    let who = creator(&s, id);
    s.pool.settle(&id, &who, &10_000); // settles 1,000

    // still inside the settlement grace window
    s.env.ledger().set_timestamp(T0 + DAY + GRACE);
    assert_eq!(s.pool.try_refund(&id), Err(Ok(Error::RefundTooEarly)));
    s.pool.settle(&id, &who, &20_000); // final settlement still allowed: +1,000

    s.env.ledger().set_timestamp(T0 + DAY + GRACE + 1);
    assert_eq!(s.pool.refund(&id), 98_000);
    assert_eq!(s.env.auths()[0].0, s.brand);
    assert_eq!(s.token.balance(&s.brand), 998_000);

    assert_eq!(s.pool.try_refund(&id), Err(Ok(Error::AlreadyRefunded)));
    assert_eq!(
        s.pool.try_settle(&id, &who, &30_000),
        Err(Ok(Error::SettlementClosed))
    );
}

#[test]
fn top_up_extends_budget() {
    let s = setup();
    let id = create(&s);
    s.pool.top_up(&id, &s.brand, &500);
    let c = s.pool.get_campaign(&id);
    assert_eq!(c.budget, 100_500);
    assert_eq!(c.remaining, 100_500);
    assert_eq!(s.token.balance(&s.pool.address), 100_500);
}

#[test]
fn rejects_bad_params() {
    let s = setup();
    let title = String::from_str(&s.env, "x");
    assert_eq!(
        s.pool.try_create_campaign(
            &s.brand,
            &s.token.address,
            &title,
            &title,
            &0,
            &10,
            &300,
            &(T0 + 10)
        ),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.pool.try_create_campaign(
            &s.brand,
            &s.token.address,
            &title,
            &title,
            &100,
            &10,
            &300,
            &T0
        ),
        Err(Ok(Error::InvalidDeadline))
    );
    assert_eq!(
        s.pool.try_get_campaign(&7),
        Err(Ok(Error::CampaignNotFound))
    );
}

// ---------------------------------------------------------------- tokens

#[test]
fn only_allowed_tokens() {
    let s = setup();
    let other = s
        .env
        .register_stellar_asset_contract_v2(s.owner.clone())
        .address();
    StellarAssetClient::new(&s.env, &other).mint(&s.brand, &1_000);
    let title = String::from_str(&s.env, "x");
    let create_in = |t: &Address| {
        s.pool
            .try_create_campaign(&s.brand, t, &title, &title, &100, &10, &50, &(T0 + 10))
    };

    assert_eq!(create_in(&other), Err(Ok(Error::TokenNotAllowed)));
    assert_eq!(s.pool.token_decimals(&other), None);

    s.pool.allow_token(&other);
    assert_eq!(s.pool.token_decimals(&other), Some(7));
    assert_eq!(create_in(&other), Ok(Ok(0)));

    s.pool.disallow_token(&other);
    assert_eq!(create_in(&other), Err(Ok(Error::TokenNotAllowed)));
}

// ------------------------------------------------------------------- fees

#[test]
fn fee_changes_apply_to_new_campaigns_only() {
    let s = setup();
    let old = create(&s);
    let treasury2 = Address::generate(&s.env);
    s.pool.set_fee(&1_000, &treasury2);
    assert_eq!(s.pool.fee_bps(), 1_000);
    let new = create(&s);

    let a = creator(&s, old);
    let b = creator(&s, new);
    assert_eq!(s.pool.settle(&old, &a, &10_000), 950);
    assert_eq!(s.pool.settle(&new, &b, &10_000), 900);
    // fees go to whichever treasury is current at settlement
    assert_eq!(s.token.balance(&treasury2), 150);
}

#[test]
fn fee_is_capped() {
    let s = setup();
    assert_eq!(
        s.pool.try_set_fee(&(MAX_FEE_BPS + 1), &s.treasury),
        Err(Ok(Error::FeeTooHigh))
    );
    s.pool.set_fee(&MAX_FEE_BPS, &s.treasury);
}

#[test]
fn zero_fee_pays_everything_to_the_creator() {
    let s = setup();
    s.pool.set_fee(&0, &s.treasury);
    let id = create(&s);
    let who = creator(&s, id);
    assert_eq!(s.pool.settle(&id, &who, &10_000), 1_000);
    assert_eq!(s.token.balance(&s.treasury), 0);
}

// ------------------------------------------------------------------ admin

#[test]
fn admin_calls_need_the_owner() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    let token = s.token.address.clone();

    // No auths at all: every privileged call fails.
    s.env.set_auths(&[]);
    assert!(s.pool.try_set_fee(&0, &stranger).is_err());
    assert!(s.pool.try_set_verifier(&stranger).is_err());
    assert!(s.pool.try_allow_token(&token).is_err());
    assert!(s.pool.try_disallow_token(&token).is_err());
    assert!(s.pool.try_migrate().is_err());
    assert!(s
        .pool
        .try_set_rent_policy(&RentPolicy {
            margin: 0,
            instance_ttl: 17_280
        })
        .is_err());
    assert!(s.pool.try_pause(&s.owner).is_err());

    // The owner's signature is what's checked.
    s.env.mock_all_auths();
    s.pool.set_verifier(&stranger);
    assert_eq!(s.env.auths()[0].0, s.owner);
    assert_eq!(s.pool.verifier(), stranger);

    // Naming someone else as the caller doesn't get past the owner check.
    assert_eq!(
        s.pool.try_pause(&stranger),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn only_the_verifier_settles() {
    let s = setup();
    let id = create(&s);
    let who = creator(&s, id);
    s.env.set_auths(&[]);
    assert!(s.pool.try_settle(&id, &who, &1_000).is_err());
}

#[test]
fn ownership_moves_in_two_steps() {
    let s = setup();
    let next = Address::generate(&s.env);
    s.pool.transfer_ownership(&next, &1_000);
    assert_eq!(s.pool.get_owner(), Some(s.owner.clone()));
    s.pool.accept_ownership();
    assert_eq!(s.pool.get_owner(), Some(next.clone()));
    s.pool.set_fee(&0, &s.treasury);
    assert_eq!(s.env.auths()[0].0, next);
}

#[test]
fn pause_stops_money_in_but_not_refunds() {
    let s = setup();
    let id = create(&s);
    let who = creator(&s, id);
    s.pool.settle(&id, &who, &10_000);

    s.pool.pause(&s.owner);
    assert!(s.pool.paused());
    let title = String::from_str(&s.env, "x");
    let paused = Some(ENFORCED_PAUSE);
    assert_eq!(
        contract_error(s.pool.try_create_campaign(
            &s.brand,
            &s.token.address,
            &title,
            &title,
            &100,
            &10,
            &300,
            &(T0 + 10)
        )),
        paused
    );
    assert_eq!(contract_error(s.pool.try_top_up(&id, &s.brand, &1)), paused);
    assert_eq!(
        contract_error(
            s.pool
                .try_submit(&id, &Address::generate(&s.env), &url(&s.env))
        ),
        paused
    );
    assert_eq!(
        contract_error(s.pool.try_settle(&id, &who, &20_000)),
        paused
    );

    // The brand can still get the unspent budget back.
    s.env.ledger().set_timestamp(T0 + DAY + GRACE + 1);
    assert_eq!(s.pool.refund(&id), 99_000);

    s.pool.unpause(&s.owner);
    assert!(!s.pool.paused());
    create_with(&s, 100, 50, T0 + 2 * DAY);
}

#[test]
fn upgrade_needs_the_owner() {
    let s = setup();
    let hash = BytesN::from_array(&s.env, &[7; 32]);
    assert_eq!(
        s.pool.try_upgrade(&hash, &Address::generate(&s.env)),
        Err(Ok(Error::Unauthorized.into()))
    );
    s.env.set_auths(&[]);
    assert!(s.pool.try_upgrade(&hash, &s.owner).is_err());
}

/// Upgrades to the release build of this contract and checks state survives.
/// Needs `stellar contract build` first; skipped otherwise.
#[test]
fn upgrade_keeps_state() {
    let wasm = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/wasm32v1-none/release/campaign_pool.wasm"
    );
    let Ok(bytes) = std::fs::read(wasm) else {
        std::eprintln!("skipping: {wasm} not built");
        return;
    };
    let s = setup();
    let id = create(&s);
    let who = creator(&s, id);
    s.pool.settle(&id, &who, &10_000);

    let hash = s
        .env
        .deployer()
        .upload_contract_wasm(soroban_sdk::Bytes::from_slice(&s.env, &bytes));
    s.pool.upgrade(&hash, &s.owner);
    assert_eq!(s.pool.migrate(), SCHEMA_VERSION);
    assert_eq!(s.pool.version(), SCHEMA_VERSION);
    assert_eq!(s.pool.get_submission(&id, &who).paid, 950);
    assert_eq!(s.pool.settle(&id, &who, &20_000), 950);
}

// ------------------------------------------------------- storage and rent

#[test]
fn submissions_page_in_order() {
    let s = setup();
    let id = create(&s);
    let all: std::vec::Vec<Address> = (0..120).map(|_| creator(&s, id)).collect();
    assert_eq!(s.pool.get_campaign(&id).creators, 120);

    let first = s.pool.get_submissions(&id, &0, &50);
    assert_eq!(first.len(), 50);
    assert_eq!(first.get(0).unwrap().creator, all[0]);
    // limit is clamped to MAX_PAGE
    assert_eq!(s.pool.get_submissions(&id, &50, &1_000).len(), MAX_PAGE);
    let last = s.pool.get_submissions(&id, &100, &50);
    assert_eq!(last.len(), 20);
    assert_eq!(last.get(19).unwrap().creator, all[119]);
    assert_eq!(s.pool.get_submissions(&id, &500, &50).len(), 0);
}

#[test]
fn submit_cost_does_not_grow_with_creators() {
    let s = setup();
    let id = create(&s);
    let cost_of_next_submit = || {
        creator(&s, id);
        s.env.cost_estimate().resources()
    };
    let first = cost_of_next_submit();
    for _ in 0..200 {
        creator(&s, id);
    }
    let later = cost_of_next_submit();
    assert_eq!(first.write_entries, later.write_entries);
    assert_eq!(first.write_bytes, later.write_bytes);
    assert_eq!(first.disk_read_bytes, later.disk_read_bytes);
}

#[test]
fn long_campaigns_outlive_settlement() {
    let s = setup();
    let deadline = T0 + 30 * DAY;
    let id = create_with(&s, 100_000, 30_000, deadline);
    let who = creator(&s, id);

    let needed = ((deadline + GRACE - T0) / 5) as u32;
    s.env.as_contract(&s.pool.address, || {
        let p = s.env.storage().persistent();
        assert!(p.get_ttl(&DataKey::Campaign(id)) > needed);
        assert!(p.get_ttl(&DataKey::Submission(id, who.clone())) > needed);
        assert!(p.get_ttl(&DataKey::Creator(id, 0)) > needed);
    });

    // Jump to the last day of the campaign: everything is still readable and
    // settlement still works.
    let ledgers = (29 * DAY / 5) as u32;
    s.env.ledger().with_mut(|l| {
        l.timestamp = T0 + 29 * DAY;
        l.sequence_number += ledgers;
    });
    assert_eq!(s.pool.settle(&id, &who, &10_000), 950);
    assert_eq!(s.pool.get_submissions(&id, &0, &10).len(), 1);
    s.pool.extend(&id, &0, &10);
}

#[test]
fn rent_policy_is_owner_tunable() {
    let s = setup();
    assert_eq!(s.pool.rent_policy().margin, 30 * 17_280);
    let cheap = RentPolicy {
        margin: 0,
        instance_ttl: 7 * 17_280,
    };
    s.pool.set_rent_policy(&cheap);
    assert_eq!(s.env.auths()[0].0, s.owner);
    assert_eq!(s.pool.rent_policy(), cheap);
    assert_eq!(
        s.pool.try_set_rent_policy(&RentPolicy {
            margin: 0,
            instance_ttl: 10
        }),
        Err(Ok(Error::InvalidAmount))
    );

    // With no margin, a campaign's entries live exactly until settlement closes
    // (or the network minimum, whichever is longer).
    let id = create_with(&s, 1_000, 500, T0 + 30 * DAY);
    let needed = ((30 * DAY + GRACE) / 5) as u32;
    s.env.as_contract(&s.pool.address, || {
        let ttl = s.env.storage().persistent().get_ttl(&DataKey::Campaign(id));
        assert!(ttl >= needed && ttl < needed + 17_280);
    });

    s.env.set_auths(&[]);
    assert!(s.pool.try_set_rent_policy(&cheap).is_err());
}

// ------------------------------------------------------------- invariants

#[derive(Debug, Clone)]
enum Op {
    Submit,
    Settle { who: usize, views: u32 },
    TopUp(u16),
}

fn op() -> impl Strategy<Value = Op> {
    prop_oneof![
        1 => Just(Op::Submit),
        6 => (0usize..8, 0u32..400_000).prop_map(|(who, views)| Op::Settle { who, views }),
        1 => (1u16..u16::MAX).prop_map(Op::TopUp),
    ]
}

proptest! {
    // PROPTEST_CASES=10000 in CI.
    #![proptest_config(ProptestConfig::with_cases(
        std::env::var("PROPTEST_CASES").ok().and_then(|v| v.parse().ok()).unwrap_or(256)
    ))]

    /// No token is created or lost: every unit of budget is either still in
    /// the pool, paid to a creator, or paid to the treasury, and no post ever
    /// costs the brand more than the cap.
    #[test]
    fn funds_are_conserved(
        budget in 1i128..200_000,
        cap in 1i128..80_000,
        fee in 0u32..=MAX_FEE_BPS,
        ops in prop::collection::vec(op(), 1..40),
    ) {
        let s = setup();
        s.pool.set_fee(&fee, &s.treasury);
        let id = create_with(&s, budget, cap, T0 + DAY);
        let mut creators: std::vec::Vec<Address> = std::vec::Vec::new();
        let mut views = [0u64; 8];
        let mut topped = 0i128;

        for op in ops {
            match op {
                Op::Submit if creators.len() < 8 => creators.push(creator(&s, id)),
                Op::Submit => {}
                Op::Settle { who, views: v } if who < creators.len() => {
                    // views only go up
                    views[who] = views[who].max(v as u64);
                    s.pool.settle(&id, &creators[who], &views[who]);
                }
                Op::Settle { .. } => {}
                Op::TopUp(amount) => {
                    s.pool.top_up(&id, &s.brand, &(amount as i128));
                    topped += amount as i128;
                }
            }
        }

        let c = s.pool.get_campaign(&id);
        let subs = s.pool.get_submissions(&id, &0, &MAX_PAGE);
        let paid: i128 = subs.iter().map(|x| x.paid).sum();
        let fees: i128 = subs.iter().map(|x| x.fee).sum();
        prop_assert_eq!(c.budget, budget + topped);
        prop_assert_eq!(paid + fees + c.remaining, c.budget);
        prop_assert_eq!(fees, c.fees);
        prop_assert!(c.remaining >= 0);
        prop_assert_eq!(s.token.balance(&s.pool.address), c.remaining);
        prop_assert_eq!(s.token.balance(&s.treasury), fees);
        for x in subs.iter() {
            prop_assert!(x.paid + x.fee <= cap);
            prop_assert!(x.fee * 10_000 <= (x.paid + x.fee) * fee as i128);
            prop_assert_eq!(s.token.balance(&x.creator), x.paid);
        }
    }
}
