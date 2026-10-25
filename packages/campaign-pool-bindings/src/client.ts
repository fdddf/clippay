import {RentPolicy, Campaign, Submission, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

export interface Client {
  pause({ caller }: { caller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Extend the TTL of a campaign and its first `limit` submissions from
   * `start`, so it survives until settlement closes. Anyone may pay for it.
   */
  extend({ id, start, limit }: { id: number; start: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Returns true if the contract is paused, and false otherwise.
   *
   * # Arguments
   *
   * * `e` - Access to Soroban environment.
   */
  paused(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Return the unspent budget to the brand once settlement has closed.
   * Works while paused, so funds can always leave.
   */
  refund({ id }: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * Report the cumulative view count of a creator's post and pay what is
   * owed. Idempotent: reporting the same count twice pays nothing extra.
   * Returns the amount paid to the creator (after the platform fee).
   */
  settle({ id, creator, views }: { id: number; creator: string | Address; views: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * Enter a campaign with a link to the post that should earn views.
   */
  submit({ id, creator, url }: { id: number; creator: string | Address; url: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Add more budget to a live campaign. Anyone may top up; funds belong to
   * the campaign and are refunded to the brand at the end.
   */
  top_up({ id, from, amount }: { id: number; from: string | Address; amount: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  fee_bps(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Bring storage written by an older version up to `SCHEMA_VERSION`.
   * Call right after `upgrade`. Idempotent.
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Fee for campaigns created from now on; live campaigns keep theirs.
   */
  set_fee({ fee_bps, treasury }: { fee_bps: number; treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  unpause({ caller }: { caller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Swap in new Wasm (already uploaded). Run `migrate` afterwards.
   */
  upgrade({ new_wasm_hash, operator }: { new_wasm_hash: Buffer; operator: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  treasury(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  verifier(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Returns `Some(Address)` if ownership is set, or `None` if ownership has
   * been renounced.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   */
  get_owner(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Allow `token` as a payout token, recording its decimals.
   */
  allow_token({ token }: { token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  rent_policy(options?: MethodOptions): Promise<AssembledTransaction<RentPolicy>>;
  get_campaign({ id }: { id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Campaign, Error>>>;
  set_verifier({ verifier }: { verifier: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  settle_grace(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  campaign_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Stop new campaigns in `token`. Existing campaigns are unaffected.
   */
  disallow_token({ token }: { token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_submission({ id, creator }: { id: number; creator: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<Submission, Error>>>;
  /**
   * Decimals of an allow-listed token, or `None` if it isn't allowed.
   */
  token_decimals({ token }: { token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number | null>>;
  /**
   * Lock `budget` of `token` from `brand` into a new campaign. Returns its id.
   */
  create_campaign({ brand, token, title, brief_url, budget, rate_per_1k, cap_per_creator, deadline }: { brand: string | Address; token: string | Address; title: string; brief_url: string; budget: bigint; rate_per_1k: bigint; cap_per_creator: bigint; deadline: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  /**
   * Submissions in the order they were made, `limit` (≤ `MAX_PAGE`) at a
   * time starting at index `start`.
   */
  get_submissions({ id, start, limit }: { id: number; start: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<Submission>, Error>>>;
  set_rent_policy({ policy }: { policy: RentPolicy }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Accepts a pending ownership transfer.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * there is no pending transfer to accept.
   *
   * # Events
   *
   * * topics - `["ownership_transfer_completed"]`
   * * data - `[new_owner: Address]`
   */
  accept_ownership(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Renounces ownership of the contract.
   *
   * Permanently removes the owner, disabling all functions gated by
   * `#[only_owner]`.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`OwnableError::TransferInProgress`] - If there is a pending ownership
   * transfer.
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   *
   * # Notes
   *
   * * Authorization for the current owner is required.
   */
  renounce_ownership(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Initiates a 2-step ownership transfer to a new address.
   *
   * Requires authorization from the current owner. The new owner must later
   * call `accept_ownership()` to complete the transfer.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `new_owner` - The proposed new owner.
   * * `live_until_ledger` - Ledger number until which the new owner can
   * accept. A value of `0` cancels any pending transfer.
   *
   * # Errors
   *
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * trying to cancel a transfer that doesn't exist.
   * * [`crate::role_transfer::RoleTransferError::InvalidLiveUntilLedger`] -
   * If the specified ledger is in the past.
   * * [`crate::role_transfer::RoleTransferError::InvalidPendingAccount`] -
   * If the specified pending account is not the same as the provided `new`
   * address.
   *
   * # Notes
   *
   * * Authorization for the current owner is required.
   */
  transfer_ownership({ new_owner, live_until_ledger }: { new_owner: string | Address; live_until_ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAEJFcnJvciBjb2RlcyBhcmUgcGFydCBvZiB0aGUgcHVibGljIGludGVyZmFjZTogbmV2ZXIgcmVudW1iZXIgdGhlbS4AAAAAAAAAAAAFRXJyb3IAAAAAAAAOAAAAAAAAABBDYW1wYWlnbk5vdEZvdW5kAAAAAQAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAIAAAAAAAAAD0ludmFsaWREZWFkbGluZQAAAAADAAAAAAAAAA1DYW1wYWlnbkVuZGVkAAAAAAAABAAAAAAAAAAQQWxyZWFkeVN1Ym1pdHRlZAAAAAUAAAAAAAAAElN1Ym1pc3Npb25Ob3RGb3VuZAAAAAAABgAAAAAAAAAOVmlld3NEZWNyZWFzZWQAAAAAAAcAAAAAAAAAEFNldHRsZW1lbnRDbG9zZWQAAAAIAAAAAAAAAA5SZWZ1bmRUb29FYXJseQAAAAAACQAAAAAAAAAPQWxyZWFkeVJlZnVuZGVkAAAAAAoAAAA8UmV0aXJlZCBpbiB2MiAoY3JlYXRvciBsaXN0cyBhcmUgcGFnZWQsIHNvIHRoZXJlIGlzIG5vIGNhcCkuAAAAD1Rvb01hbnlDcmVhdG9ycwAAAAALAAAAAAAAAA9Ub2tlbk5vdEFsbG93ZWQAAAAADAAAAAAAAAAKRmVlVG9vSGlnaAAAAAAADQAAAAAAAAAMVW5hdXRob3JpemVkAAAADg==", "AAAABQAAAAAAAAAAAAAAB1NldHRsZWQAAAAAAQAAAAdzZXR0bGVkAAAAAAUAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAQAAAAAAAAAFdmlld3MAAAAAAAAGAAAAAAAAABRQYWlkIHRvIHRoZSBjcmVhdG9yLgAAAAZhbW91bnQAAAAAAAsAAAAAAAAAHlBhaWQgdG8gdGhlIHBsYXRmb3JtIHRyZWFzdXJ5LgAAAAAAA2ZlZQAAAAALAAAAAAAAAAI=", "AAAAAQAAAAAAAAAAAAAACENhbXBhaWduAAAADwAAAAAAAAAFYnJhbmQAAAAAAAATAAAAPkxpbmsgdG8gdGhlIGNyZWF0aXZlIGJyaWVmIChOb3Rpb24gcGFnZSwgR29vZ2xlIERvYywgSVBGU+KApikuAAAAAAAJYnJpZWZfdXJsAAAAAAAAEAAAABxUb3RhbCBhbW91bnQgZXZlciBkZXBvc2l0ZWQuAAAABmJ1ZGdldAAAAAAACwAAAEJNYXhpbXVtIGEgc2luZ2xlIGNyZWF0b3IncyBwb3N0IGNhbiBjb3N0IHRoZSBicmFuZCAocGF5b3V0ICsgZmVlKS4AAAAAAA9jYXBfcGVyX2NyZWF0b3IAAAAACwAAABZOdW1iZXIgb2Ygc3VibWlzc2lvbnMuAAAAAAAIY3JlYXRvcnMAAAAEAAAAO1VuaXggdGltZXN0YW1wIGFmdGVyIHdoaWNoIG5vIG5ldyBzdWJtaXNzaW9ucyBhcmUgYWNjZXB0ZWQuAAAAAAhkZWFkbGluZQAAAAYAAAA5VGhlIHRva2VuJ3MgZGVjaW1hbHMsIHJlYWQgd2hlbiB0aGUgY2FtcGFpZ24gd2FzIGNyZWF0ZWQuAAAAAAAACGRlY2ltYWxzAAAABAAAAEJQbGF0Zm9ybSBmZWUgaW4gYmFzaXMgcG9pbnRzLCBmaXhlZCB3aGVuIHRoZSBjYW1wYWlnbiB3YXMgY3JlYXRlZC4AAAAAAAdmZWVfYnBzAAAAAAQAAAAtVG90YWwgcGxhdGZvcm0gZmVlcyB0YWtlbiBmcm9tIHRoaXMgY2FtcGFpZ24uAAAAAAAABGZlZXMAAAALAAAAAAAAAAJpZAAAAAAABAAAAENUb2tlbiB1bml0cyBwYWlkIHBlciAxLDAwMCB2ZXJpZmllZCB2aWV3cywgYmVmb3JlIHRoZSBwbGF0Zm9ybSBmZWUuAAAAAAtyYXRlX3Blcl8xawAAAAALAAAAAAAAAAhyZWZ1bmRlZAAAAAEAAAA0QW1vdW50IHN0aWxsIGhlbGQgYnkgdGhlIGNvbnRyYWN0IGZvciB0aGlzIGNhbXBhaWduLgAAAAlyZW1haW5pbmcAAAAAAAALAAAAAAAAAAV0aXRsZQAAAAAAABAAAAAAAAAABXRva2VuAAAAAAAAEw==", "AAAABQAAAAAAAAAAAAAACFJlZnVuZGVkAAAAAQAAAAhyZWZ1bmRlZAAAAAIAAAAAAAAAAmlkAAAAAAAEAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAACFRvcHBlZFVwAAAAAQAAAAl0b3BwZWRfdXAAAAAAAAADAAAAAAAAAAJpZAAAAAAABAAAAAEAAAAAAAAABGZyb20AAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAACVN1Ym1pdHRlZAAAAAAAAAEAAAAJc3VibWl0dGVkAAAAAAAAAwAAAAAAAAACaWQAAAAAAAQAAAABAAAAAAAAAAdjcmVhdG9yAAAAABMAAAABAAAAAAAAAAN1cmwAAAAAEAAAAAAAAAAC", "AAAAAQAAALxIb3cgbG9uZyBzdGF0ZSBpcyBrZXB0IGFsaXZlLiBSZW50IGlzIHBhaWQgYnkgd2hvZXZlcidzIHRyYW5zYWN0aW9uCmV4dGVuZHMgYW4gZW50cnk6IHRoZSBicmFuZCB3aGVuIGNyZWF0aW5nLCB0aGUgY3JlYXRvciAob3IgdGhlIGZlZQpzcG9uc29yKSB3aGVuIHN1Ym1pdHRpbmcsIHRoZSB2ZXJpZmllciB3aGVuIHNldHRsaW5nLgAAAAAAAAAKUmVudFBvbGljeQAAAAAAAgAAAGJMZWRnZXJzIHRoZSBjb250cmFjdCBpbnN0YW5jZSAoYW5kIGl0cyBjb2RlKSBpcyBleHRlbmRlZCB0bzsgcmVuZXdlZAp3aGVuZXZlciBpdCBmYWxscyBiZWxvdyBoYWxmLgAAAAAADGluc3RhbmNlX3R0bAAAAAQAAABYTGVkZ2VycyBjYW1wYWlnbiBlbnRyaWVzIG91dGxpdmUgdGhlIGVuZCBvZiBzZXR0bGVtZW50LCBzbyB0aGUgYnJhbmQKaGFzIHRpbWUgdG8gcmVmdW5kLgAAAAZtYXJnaW4AAAAAAAQ=", "AAAAAQAAAAAAAAAAAAAAClN1Ym1pc3Npb24AAAAAAAYAAAAAAAAAB2NyZWF0b3IAAAAAEwAAADhQbGF0Zm9ybSBmZWVzIHRha2VuIGZyb20gdGhpcyBjcmVhdG9yJ3MgZWFybmluZ3Mgc28gZmFyLgAAAANmZWUAAAAACwAAADNUb3RhbCBwYWlkIG91dCB0byB0aGlzIGNyZWF0b3Igc28gZmFyIChhZnRlciBmZWVzKS4AAAAABHBhaWQAAAALAAAAAAAAAAxzdWJtaXR0ZWRfYXQAAAAGAAAAAAAAAAN1cmwAAAAAEAAAAC1IaWdoZXN0IHZpZXcgY291bnQgdGhlIHZlcmlmaWVyIGhhcyByZXBvcnRlZC4AAAAAAAAFdmlld3MAAAAAAAAG", "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", "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAA", "AAAAAAAAAD5Td2FwIGluIG5ldyBXYXNtIChhbHJlYWR5IHVwbG9hZGVkKS4gUnVuIGBtaWdyYXRlYCBhZnRlcndhcmRzLgAAAAAAB3VwZ3JhZGUAAAAAAgAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAA", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=", "AAAAAAAAAAAAAAAIdHJlYXN1cnkAAAAAAAAAAQAAABM=", "AAAAAAAAAAAAAAAIdmVyaWZpZXIAAAAAAAAAAQAAABM=", "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAADhBbGxvdyBgdG9rZW5gIGFzIGEgcGF5b3V0IHRva2VuLCByZWNvcmRpbmcgaXRzIGRlY2ltYWxzLgAAAAthbGxvd190b2tlbgAAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAA", "AAAAAAAAAAAAAAALcmVudF9wb2xpY3kAAAAAAAAAAAEAAAfQAAAAClJlbnRQb2xpY3kAAA==", "AAAAAAAAAAAAAAAMZ2V0X2NhbXBhaWduAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAB9AAAAAIQ2FtcGFpZ24AAAAD", "AAAAAAAAAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAA==", "AAAAAAAAAAAAAAAMc2V0dGxlX2dyYWNlAAAAAAAAAAEAAAAG", "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAYAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAAB2ZlZV9icHMAAAAABAAAAAAAAAAMc2V0dGxlX2dyYWNlAAAABgAAAAAAAAAGdG9rZW5zAAAAAAPqAAAAEwAAAAA=", "AAAAAAAAAAAAAAAOY2FtcGFpZ25fY291bnQAAAAAAAAAAAABAAAABA==", "AAAAAAAAAEFTdG9wIG5ldyBjYW1wYWlnbnMgaW4gYHRva2VuYC4gRXhpc3RpbmcgY2FtcGFpZ25zIGFyZSB1bmFmZmVjdGVkLgAAAAAAAA5kaXNhbGxvd190b2tlbgAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==", "AAAAAAAAAAAAAAAOZ2V0X3N1Ym1pc3Npb24AAAAAAAIAAAAAAAAAAmlkAAAAAAAEAAAAAAAAAAdjcmVhdG9yAAAAABMAAAABAAAD6QAAB9AAAAAKU3VibWlzc2lvbgAAAAAAAw==", "AAAAAAAAAEFEZWNpbWFscyBvZiBhbiBhbGxvdy1saXN0ZWQgdG9rZW4sIG9yIGBOb25lYCBpZiBpdCBpc24ndCBhbGxvd2VkLgAAAAAAAA50b2tlbl9kZWNpbWFscwAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+gAAAAE", "AAAAAAAAAEpMb2NrIGBidWRnZXRgIG9mIGB0b2tlbmAgZnJvbSBgYnJhbmRgIGludG8gYSBuZXcgY2FtcGFpZ24uIFJldHVybnMgaXRzIGlkLgAAAAAAD2NyZWF0ZV9jYW1wYWlnbgAAAAAIAAAAAAAAAAVicmFuZAAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAFdGl0bGUAAAAAAAAQAAAAAAAAAAlicmllZl91cmwAAAAAAAAQAAAAAAAAAAZidWRnZXQAAAAAAAsAAAAAAAAAC3JhdGVfcGVyXzFrAAAAAAsAAAAAAAAAD2NhcF9wZXJfY3JlYXRvcgAAAAALAAAAAAAAAAhkZWFkbGluZQAAAAYAAAABAAAD6QAAAAQAAAAD", "AAAAAAAAAGZTdWJtaXNzaW9ucyBpbiB0aGUgb3JkZXIgdGhleSB3ZXJlIG1hZGUsIGBsaW1pdGAgKOKJpCBgTUFYX1BBR0VgKSBhdCBhCnRpbWUgc3RhcnRpbmcgYXQgaW5kZXggYHN0YXJ0YC4AAAAAAA9nZXRfc3VibWlzc2lvbnMAAAAAAwAAAAAAAAACaWQAAAAAAAQAAAAAAAAABXN0YXJ0AAAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+kAAAPqAAAH0AAAAApTdWJtaXNzaW9uAAAAAAAD", "AAAAAAAAAAAAAAAPc2V0X3JlbnRfcG9saWN5AAAAAAEAAAAAAAAABnBvbGljeQAAAAAH0AAAAApSZW50UG9saWN5AAAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==", "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA", "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA", "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==", "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAAAAAAAAAAGUGF1c2VkAAAAAAABAAAABnBhdXNlZAAAAAAAAAAAAAI=", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHVucGF1c2VkLgAAAAAAAAAIVW5wYXVzZWQAAAABAAAACHVucGF1c2VkAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAADVBhdXNhYmxlRXJyb3IAAAAAAAACAAAANFRoZSBvcGVyYXRpb24gZmFpbGVkIGJlY2F1c2UgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAANRW5mb3JjZWRQYXVzZQAAAAAAA+gAAAA4VGhlIG9wZXJhdGlvbiBmYWlsZWQgYmVjYXVzZSB0aGUgY29udHJhY3QgaXMgbm90IHBhdXNlZC4AAAANRXhwZWN0ZWRQYXVzZQAAAAAAA+k="]),
      options
    );
  }

   static deploy<T = Client>({ owner, verifier, treasury, fee_bps, settle_grace, tokens }: { owner: string | Address; verifier: string | Address; treasury: string | Address; fee_bps: number; settle_grace: bigint; tokens: Array<string | Address> }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Buffer | Uint8Array; address?: string; } & ({ wasmHash: Buffer | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ owner, verifier, treasury, fee_bps, settle_grace, tokens }, options);
  }
  public readonly fromJSON = {
    pause : this.txFromJSON<void>,  extend : this.txFromJSON<Result<null, Error>>,  paused : this.txFromJSON<boolean>,  refund : this.txFromJSON<Result<bigint, Error>>,  settle : this.txFromJSON<Result<bigint, Error>>,  submit : this.txFromJSON<Result<null, Error>>,  top_up : this.txFromJSON<Result<null, Error>>,  fee_bps : this.txFromJSON<number>,  migrate : this.txFromJSON<number>,  set_fee : this.txFromJSON<Result<null, Error>>,  unpause : this.txFromJSON<void>,  upgrade : this.txFromJSON<void>,  version : this.txFromJSON<number>,  treasury : this.txFromJSON<string>,  verifier : this.txFromJSON<string>,  get_owner : this.txFromJSON<string | null>,  allow_token : this.txFromJSON<void>,  rent_policy : this.txFromJSON<RentPolicy>,  get_campaign : this.txFromJSON<Result<Campaign, Error>>,  set_verifier : this.txFromJSON<void>,  settle_grace : this.txFromJSON<bigint>,  campaign_count : this.txFromJSON<number>,  disallow_token : this.txFromJSON<void>,  get_submission : this.txFromJSON<Result<Submission, Error>>,  token_decimals : this.txFromJSON<number | null>,  create_campaign : this.txFromJSON<Result<number, Error>>,  get_submissions : this.txFromJSON<Result<Array<Submission>, Error>>,  set_rent_policy : this.txFromJSON<Result<null, Error>>,  accept_ownership : this.txFromJSON<void>,  renounce_ownership : this.txFromJSON<void>,  transfer_ownership : this.txFromJSON<void>
  };

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "Settled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  settledEventFilter(topicValues?: { id?: number; creator?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Settled", topicValues);
  }
  /**
   * Build a topics filter row for the "Refunded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  refundedEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("Refunded", topicValues);
  }
  /**
   * Build a topics filter row for the "ToppedUp" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  toppedUpEventFilter(topicValues?: { id?: number }): string[] {
    return this.spec.eventTopicFilter("ToppedUp", topicValues);
  }
  /**
   * Build a topics filter row for the "Submitted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  submittedEventFilter(topicValues?: { id?: number; creator?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Submitted", topicValues);
  }
  /**
   * Build a topics filter row for the "TokenAllowed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  tokenAllowedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TokenAllowed", topicValues);
  }
  /**
   * Build a topics filter row for the "ConfigChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  configChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("ConfigChanged");
  }
  /**
   * Build a topics filter row for the "CampaignCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  campaignCreatedEventFilter(topicValues?: { id?: number; brand?: string | Address }): string[] {
    return this.spec.eventTopicFilter("CampaignCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "OwnershipTransfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipTransferEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipTransfer");
  }
  /**
   * Build a topics filter row for the "OwnershipRenounced" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipRenouncedEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipRenounced");
  }
  /**
   * Build a topics filter row for the "OwnershipTransferCompleted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipTransferCompletedEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipTransferCompleted");
  }
  /**
   * Build a topics filter row for the "Paused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  pausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Paused");
  }
  /**
   * Build a topics filter row for the "Unpaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  unpausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Unpaused");
  }
}