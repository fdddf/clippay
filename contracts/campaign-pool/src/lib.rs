//! CampaignPool — pay-per-view creator bounties.
//!
//! A brand locks a budget (an allow-listed SEP-41 token, e.g. the USDC SAC)
//! into a campaign and sets a rate per 1,000 views. Creators submit a link to
//! their post. A trusted verifier reports each post's cumulative view count;
//! the contract pays the difference between what the creator has earned and
//! what they've already been paid, capped per creator and by the remaining
//! budget. A platform fee (basis points, fixed per campaign at creation) is
//! taken out of each payout. After the campaign ends (plus a grace period for
//! final settlement) the brand reclaims whatever is left.
//!
//! Admin: OpenZeppelin `Ownable` (two-step transfer), `Pausable` and
//! `Upgradeable`. Pausing stops new campaigns, top-ups, submissions and
//! settlement; refunds stay open so a brand's money is never stuck.
//!
//! Funds invariant, per campaign: `paid + fees + remaining == budget`, where
//! `paid`/`fees` are summed over its submissions.
#![no_std]
// Contract entry points mirror the on-chain ABI; grouping their arguments would
// only move the count into a struct callers must build.
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, String, Vec,
};
use stellar_access::ownable::{self, Ownable};
use stellar_contract_utils::pausable::{self, Pausable};
use stellar_contract_utils::upgradeable::{self, Upgradeable};

/// Bumped whenever the storage layout changes; `migrate` brings old state up.
pub const SCHEMA_VERSION: u32 = 2;
/// Hard ceiling on the platform fee: 20%.
pub const MAX_FEE_BPS: u32 = 2_000;
/// Largest page `get_submissions` returns.
pub const MAX_PAGE: u32 = 50;

const DAY_IN_LEDGERS: u32 = 17_280;
const SECONDS_PER_LEDGER: u64 = 5;
/// Default `RentPolicy`: sized for mainnet. Testnet rent is far higher, so
/// deployments there lower it with `set_rent_policy`.
const DEFAULT_MARGIN: u32 = 30 * DAY_IN_LEDGERS;
const DEFAULT_INSTANCE_TTL: u32 = 30 * DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Verifier,
    /// Seconds after `deadline` during which the verifier can still settle and
    /// the brand cannot refund.
    SettleGrace,
    NextId,
    Treasury,
    FeeBps,
    /// Allow-listed payout token → its `decimals()`.
    Token(Address),
    Campaign(u32),
    /// The nth creator to enter a campaign (0-based), for paging.
    Creator(u32, u32),
    Submission(u32, Address),
    RentPolicy,
}

/// How long state is kept alive. Rent is paid by whoever's transaction
/// extends an entry: the brand when creating, the creator (or the fee
/// sponsor) when submitting, the verifier when settling.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RentPolicy {
    /// Ledgers campaign entries outlive the end of settlement, so the brand
    /// has time to refund.
    pub margin: u32,
    /// Ledgers the contract instance (and its code) is extended to; renewed
    /// whenever it falls below half.
    pub instance_ttl: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    pub id: u32,
    pub brand: Address,
    pub token: Address,
    /// The token's decimals, read when the campaign was created.
    pub decimals: u32,
    pub title: String,
    /// Link to the creative brief (Notion page, Google Doc, IPFS…).
    pub brief_url: String,
    /// Total amount ever deposited.
    pub budget: i128,
    /// Amount still held by the contract for this campaign.
    pub remaining: i128,
    /// Token units paid per 1,000 verified views, before the platform fee.
    pub rate_per_1k: i128,
    /// Maximum a single creator's post can cost the brand (payout + fee).
    pub cap_per_creator: i128,
    /// Unix timestamp after which no new submissions are accepted.
    pub deadline: u64,
    pub refunded: bool,
    /// Platform fee in basis points, fixed when the campaign was created.
    pub fee_bps: u32,
    /// Number of submissions.
    pub creators: u32,
    /// Total platform fees taken from this campaign.
    pub fees: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    pub creator: Address,
    pub url: String,
    pub submitted_at: u64,
    /// Highest view count the verifier has reported.
    pub views: u64,
    /// Total paid out to this creator so far (after fees).
    pub paid: i128,
    /// Platform fees taken from this creator's earnings so far.
    pub fee: i128,
}

/// Error codes are part of the public interface: never renumber them.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    CampaignNotFound = 1,
    InvalidAmount = 2,
    InvalidDeadline = 3,
    CampaignEnded = 4,
    AlreadySubmitted = 5,
    SubmissionNotFound = 6,
    ViewsDecreased = 7,
    SettlementClosed = 8,
    RefundTooEarly = 9,
    AlreadyRefunded = 10,
    /// Retired in v2 (creator lists are paged, so there is no cap).
    TooManyCreators = 11,
    TokenNotAllowed = 12,
    FeeTooHigh = 13,
    Unauthorized = 14,
}

#[contractevent]
pub struct CampaignCreated {
    #[topic]
    pub id: u32,
    #[topic]
    pub brand: Address,
    pub budget: i128,
    pub rate_per_1k: i128,
}

#[contractevent]
pub struct ToppedUp {
    #[topic]
    pub id: u32,
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Submitted {
    #[topic]
    pub id: u32,
    #[topic]
    pub creator: Address,
    pub url: String,
}

#[contractevent]
pub struct Settled {
    #[topic]
    pub id: u32,
    #[topic]
    pub creator: Address,
    pub views: u64,
    /// Paid to the creator.
    pub amount: i128,
    /// Paid to the platform treasury.
    pub fee: i128,
}

#[contractevent]
pub struct Refunded {
    #[topic]
    pub id: u32,
    pub amount: i128,
}

#[contractevent]
pub struct ConfigChanged {
    pub verifier: Address,
    pub treasury: Address,
    pub fee_bps: u32,
}

#[contractevent]
pub struct TokenAllowed {
    #[topic]
    pub token: Address,
    pub allowed: bool,
}

#[contract]
pub struct CampaignPool;

#[contractimpl]
impl CampaignPool {
    pub fn __constructor(
        env: Env,
        owner: Address,
        verifier: Address,
        treasury: Address,
        fee_bps: u32,
        settle_grace: u64,
        tokens: Vec<Address>,
    ) {
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        ownable::set_owner(&env, &owner);
        upgradeable::set_schema_version(&env, SCHEMA_VERSION);
        let s = env.storage().instance();
        s.set(&DataKey::Verifier, &verifier);
        s.set(&DataKey::Treasury, &treasury);
        s.set(&DataKey::FeeBps, &fee_bps);
        s.set(&DataKey::SettleGrace, &settle_grace);
        s.set(&DataKey::NextId, &0u32);
        for t in tokens.iter() {
            allow(&env, &t);
        }
    }

    // ---------------------------------------------------------------- brand

    /// Lock `budget` of `token` from `brand` into a new campaign. Returns its id.
    pub fn create_campaign(
        env: Env,
        brand: Address,
        token: Address,
        title: String,
        brief_url: String,
        budget: i128,
        rate_per_1k: i128,
        cap_per_creator: i128,
        deadline: u64,
    ) -> Result<u32, Error> {
        pausable::when_not_paused(&env);
        brand.require_auth();
        if budget <= 0 || rate_per_1k <= 0 || cap_per_creator <= 0 {
            return Err(Error::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }
        let decimals: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::Token(token.clone()))
            .ok_or(Error::TokenNotAllowed)?;

        token::TokenClient::new(&env, &token).transfer(
            &brand,
            env.current_contract_address(),
            &budget,
        );

        let id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let campaign = Campaign {
            id,
            brand: brand.clone(),
            token,
            decimals,
            title,
            brief_url,
            budget,
            remaining: budget,
            rate_per_1k,
            cap_per_creator,
            deadline,
            refunded: false,
            fee_bps: fee_bps(&env),
            creators: 0,
            fees: 0,
        };
        save_campaign(&env, &campaign);
        bump_instance(&env);

        CampaignCreated {
            id,
            brand,
            budget,
            rate_per_1k,
        }
        .publish(&env);
        Ok(id)
    }

    /// Add more budget to a live campaign. Anyone may top up; funds belong to
    /// the campaign and are refunded to the brand at the end.
    pub fn top_up(env: Env, id: u32, from: Address, amount: i128) -> Result<(), Error> {
        pausable::when_not_paused(&env);
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let mut c = load_campaign(&env, id)?;
        if c.refunded || env.ledger().timestamp() > c.deadline {
            return Err(Error::CampaignEnded);
        }
        token::TokenClient::new(&env, &c.token).transfer(
            &from,
            env.current_contract_address(),
            &amount,
        );
        c.budget += amount;
        c.remaining += amount;
        save_campaign(&env, &c);
        ToppedUp { id, from, amount }.publish(&env);
        Ok(())
    }

    /// Return the unspent budget to the brand once settlement has closed.
    /// Works while paused, so funds can always leave.
    pub fn refund(env: Env, id: u32) -> Result<i128, Error> {
        let mut c = load_campaign(&env, id)?;
        c.brand.require_auth();
        if c.refunded {
            return Err(Error::AlreadyRefunded);
        }
        if env.ledger().timestamp() <= c.deadline + settle_grace(&env) {
            return Err(Error::RefundTooEarly);
        }
        let amount = c.remaining;
        if amount > 0 {
            token::TokenClient::new(&env, &c.token).transfer(
                &env.current_contract_address(),
                &c.brand,
                &amount,
            );
        }
        c.remaining = 0;
        c.refunded = true;
        save_campaign(&env, &c);
        Refunded { id, amount }.publish(&env);
        Ok(amount)
    }

    // -------------------------------------------------------------- creator

    /// Enter a campaign with a link to the post that should earn views.
    pub fn submit(env: Env, id: u32, creator: Address, url: String) -> Result<(), Error> {
        pausable::when_not_paused(&env);
        creator.require_auth();
        let mut c = load_campaign(&env, id)?;
        let now = env.ledger().timestamp();
        if c.refunded || now > c.deadline {
            return Err(Error::CampaignEnded);
        }
        let key = DataKey::Submission(id, creator.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadySubmitted);
        }

        // One fixed-size entry per creator: the cost of a submission doesn't
        // grow with the number of creators already in the campaign.
        let ttl = campaign_ttl(&env, &c);
        set_persistent(&env, &DataKey::Creator(id, c.creators), &creator, ttl);
        let sub = Submission {
            creator: creator.clone(),
            url: url.clone(),
            submitted_at: now,
            views: 0,
            paid: 0,
            fee: 0,
        };
        set_persistent(&env, &key, &sub, ttl);
        c.creators += 1;
        save_campaign(&env, &c);

        Submitted { id, creator, url }.publish(&env);
        Ok(())
    }

    // ------------------------------------------------------------- verifier

    /// Report the cumulative view count of a creator's post and pay what is
    /// owed. Idempotent: reporting the same count twice pays nothing extra.
    /// Returns the amount paid to the creator (after the platform fee).
    pub fn settle(env: Env, id: u32, creator: Address, views: u64) -> Result<i128, Error> {
        pausable::when_not_paused(&env);
        verifier(&env).require_auth();
        let mut c = load_campaign(&env, id)?;
        if c.refunded || env.ledger().timestamp() > c.deadline + settle_grace(&env) {
            return Err(Error::SettlementClosed);
        }
        let key = DataKey::Submission(id, creator.clone());
        let mut sub: Submission = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::SubmissionNotFound)?;
        if views < sub.views {
            return Err(Error::ViewsDecreased);
        }

        let owed = (earned(&c, views) - (sub.paid + sub.fee))
            .max(0)
            .min(c.remaining);
        // Rounds down, in the creator's favour.
        let fee = owed * c.fee_bps as i128 / 10_000;
        let amount = owed - fee;
        if owed > 0 {
            let token = token::TokenClient::new(&env, &c.token);
            let me = env.current_contract_address();
            token.transfer(&me, &creator, &amount);
            if fee > 0 {
                token.transfer(&me, treasury(&env), &fee);
            }
            c.remaining -= owed;
            c.fees += fee;
        }
        // Saved even when nothing is owed: this keeps the campaign's state
        // alive while the verifier keeps polling.
        save_campaign(&env, &c);
        sub.views = views;
        sub.paid += amount;
        sub.fee += fee;
        set_persistent(&env, &key, &sub, campaign_ttl(&env, &c));
        bump_instance(&env);

        Settled {
            id,
            creator,
            views,
            amount,
            fee,
        }
        .publish(&env);
        Ok(amount)
    }

    // ---------------------------------------------------------------- admin

    pub fn set_verifier(env: Env, verifier: Address) {
        ownable::enforce_owner_auth(&env);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        config_changed(&env);
    }

    /// Fee for campaigns created from now on; live campaigns keep theirs.
    pub fn set_fee(env: Env, fee_bps: u32, treasury: Address) -> Result<(), Error> {
        ownable::enforce_owner_auth(&env);
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }
        let s = env.storage().instance();
        s.set(&DataKey::FeeBps, &fee_bps);
        s.set(&DataKey::Treasury, &treasury);
        config_changed(&env);
        Ok(())
    }

    /// Allow `token` as a payout token, recording its decimals.
    pub fn allow_token(env: Env, token: Address) {
        ownable::enforce_owner_auth(&env);
        allow(&env, &token);
    }

    /// Stop new campaigns in `token`. Existing campaigns are unaffected.
    pub fn disallow_token(env: Env, token: Address) {
        ownable::enforce_owner_auth(&env);
        env.storage()
            .persistent()
            .remove(&DataKey::Token(token.clone()));
        TokenAllowed {
            token,
            allowed: false,
        }
        .publish(&env);
    }

    pub fn set_rent_policy(env: Env, policy: RentPolicy) -> Result<(), Error> {
        ownable::enforce_owner_auth(&env);
        if policy.instance_ttl < DAY_IN_LEDGERS {
            return Err(Error::InvalidAmount);
        }
        env.storage().instance().set(&DataKey::RentPolicy, &policy);
        bump_instance(&env);
        Ok(())
    }

    /// Bring storage written by an older version up to `SCHEMA_VERSION`.
    /// Call right after `upgrade`. Idempotent.
    pub fn migrate(env: Env) -> u32 {
        ownable::enforce_owner_auth(&env);
        // v2 is the first upgradeable version: nothing to convert yet.
        if upgradeable::get_schema_version(&env) < SCHEMA_VERSION {
            upgradeable::set_schema_version(&env, SCHEMA_VERSION);
        }
        SCHEMA_VERSION
    }

    /// Extend the TTL of a campaign and its first `limit` submissions from
    /// `start`, so it survives until settlement closes. Anyone may pay for it.
    pub fn extend(env: Env, id: u32, start: u32, limit: u32) -> Result<(), Error> {
        let c = load_campaign(&env, id)?;
        let ttl = campaign_ttl(&env, &c);
        let p = env.storage().persistent();
        extend_persistent(&env, &DataKey::Campaign(id), ttl);
        for n in start..c.creators.min(start.saturating_add(limit)) {
            let key = DataKey::Creator(id, n);
            if let Some(creator) = p.get::<_, Address>(&key) {
                extend_persistent(&env, &key, ttl);
                extend_persistent(&env, &DataKey::Submission(id, creator), ttl);
            }
        }
        bump_instance(&env);
        Ok(())
    }

    // ---------------------------------------------------------------- views

    pub fn campaign_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    pub fn get_campaign(env: Env, id: u32) -> Result<Campaign, Error> {
        load_campaign(&env, id)
    }

    /// Submissions in the order they were made, `limit` (≤ `MAX_PAGE`) at a
    /// time starting at index `start`.
    pub fn get_submissions(
        env: Env,
        id: u32,
        start: u32,
        limit: u32,
    ) -> Result<Vec<Submission>, Error> {
        let c = load_campaign(&env, id)?;
        let end = c.creators.min(start.saturating_add(limit.min(MAX_PAGE)));
        let p = env.storage().persistent();
        let mut out = Vec::new(&env);
        for n in start..end {
            if let Some(creator) = p.get::<_, Address>(&DataKey::Creator(id, n)) {
                if let Some(sub) = p.get::<_, Submission>(&DataKey::Submission(id, creator)) {
                    out.push_back(sub);
                }
            }
        }
        Ok(out)
    }

    pub fn get_submission(env: Env, id: u32, creator: Address) -> Result<Submission, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Submission(id, creator))
            .ok_or(Error::SubmissionNotFound)
    }

    pub fn verifier(env: Env) -> Address {
        verifier(&env)
    }

    pub fn settle_grace(env: Env) -> u64 {
        settle_grace(&env)
    }

    pub fn fee_bps(env: Env) -> u32 {
        fee_bps(&env)
    }

    pub fn treasury(env: Env) -> Address {
        treasury(&env)
    }

    /// Decimals of an allow-listed token, or `None` if it isn't allowed.
    pub fn token_decimals(env: Env, token: Address) -> Option<u32> {
        env.storage().persistent().get(&DataKey::Token(token))
    }

    pub fn rent_policy(env: Env) -> RentPolicy {
        rent_policy(&env)
    }

    pub fn version(env: Env) -> u32 {
        upgradeable::get_schema_version(&env)
    }
}

#[contractimpl(contracttrait)]
impl Ownable for CampaignPool {}

#[contractimpl(contracttrait)]
impl Pausable for CampaignPool {
    fn pause(e: &Env, caller: Address) {
        only_owner(e, &caller);
        pausable::pause(e);
    }

    fn unpause(e: &Env, caller: Address) {
        only_owner(e, &caller);
        pausable::unpause(e);
    }
}

#[contractimpl]
impl Upgradeable for CampaignPool {
    /// Swap in new Wasm (already uploaded). Run `migrate` afterwards.
    fn upgrade(e: &Env, new_wasm_hash: BytesN<32>, operator: Address) {
        only_owner(e, &operator);
        upgradeable::upgrade(e, &new_wasm_hash);
    }
}

fn only_owner(env: &Env, caller: &Address) {
    let owner = ownable::enforce_owner_auth(env);
    if *caller != owner {
        panic_with_error!(env, Error::Unauthorized);
    }
}

/// What a creator's post has earned at `views` (payout + fee), before the
/// budget cap. Saturates instead of overflowing.
pub fn earned(c: &Campaign, views: u64) -> i128 {
    (views as i128)
        .checked_mul(c.rate_per_1k)
        .map(|v| v / 1000)
        .unwrap_or(i128::MAX)
        .min(c.cap_per_creator)
}

fn allow(env: &Env, token: &Address) {
    let decimals = token::TokenClient::new(env, token).decimals();
    let key = DataKey::Token(token.clone());
    let max = env.storage().max_ttl();
    let p = env.storage().persistent();
    p.set(&key, &decimals);
    p.extend_ttl(&key, max / 2, max);
    TokenAllowed {
        token: token.clone(),
        allowed: true,
    }
    .publish(env);
}

fn config_changed(env: &Env) {
    ConfigChanged {
        verifier: verifier(env),
        treasury: treasury(env),
        fee_bps: fee_bps(env),
    }
    .publish(env);
    bump_instance(env);
}

fn rent_policy(env: &Env) -> RentPolicy {
    env.storage()
        .instance()
        .get(&DataKey::RentPolicy)
        .unwrap_or(RentPolicy {
            margin: DEFAULT_MARGIN,
            instance_ttl: DEFAULT_INSTANCE_TTL,
        })
}

fn verifier(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Verifier).unwrap()
}

fn treasury(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Treasury).unwrap()
}

fn fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
}

fn settle_grace(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::SettleGrace)
        .unwrap_or(0)
}

/// Ledgers a campaign's entries must stay live: until settlement closes, plus
/// a margin for the refund, bounded by the network maximum.
fn campaign_ttl(env: &Env, c: &Campaign) -> u32 {
    let closes = c.deadline.saturating_add(settle_grace(env));
    let secs = closes.saturating_sub(env.ledger().timestamp());
    let ledgers = u32::try_from(secs / SECONDS_PER_LEDGER).unwrap_or(u32::MAX);
    ledgers
        .saturating_add(rent_policy(env).margin)
        .min(env.storage().max_ttl())
}

/// Renews the instance (and the contract code) once it is below half of the
/// policy's TTL. The code entry is large, so this is kept independent of how
/// long any campaign runs.
fn bump_instance(env: &Env) {
    let ttl = rent_policy(env).instance_ttl.min(env.storage().max_ttl());
    env.storage().instance().extend_ttl(ttl / 2, ttl);
}

/// Extends only when the entry has less than a day of headroom left, so
/// frequent writers don't pay for rent they already bought.
fn extend_persistent(env: &Env, key: &DataKey, ttl: u32) {
    env.storage()
        .persistent()
        .extend_ttl(key, ttl.saturating_sub(DAY_IN_LEDGERS), ttl);
}

fn set_persistent<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
    value: &V,
    ttl: u32,
) {
    env.storage().persistent().set(key, value);
    extend_persistent(env, key, ttl);
}

fn load_campaign(env: &Env, id: u32) -> Result<Campaign, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Campaign(id))
        .ok_or(Error::CampaignNotFound)
}

fn save_campaign(env: &Env, c: &Campaign) {
    set_persistent(env, &DataKey::Campaign(c.id), c, campaign_ttl(env, c));
}

mod test;
