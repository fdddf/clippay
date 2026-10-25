import {Address} from '@stellar/stellar-sdk';

    /**
 * Error codes are part of the public interface: never renumber them.
 */
export const Error = {
  1 : { message: "CampaignNotFound" },
  2 : { message: "InvalidAmount" },
  3 : { message: "InvalidDeadline" },
  4 : { message: "CampaignEnded" },
  5 : { message: "AlreadySubmitted" },
  6 : { message: "SubmissionNotFound" },
  7 : { message: "ViewsDecreased" },
  8 : { message: "SettlementClosed" },
  9 : { message: "RefundTooEarly" },
  10 : { message: "AlreadyRefunded" },
  /**
   * Retired in v2 (creator lists are paged, so there is no cap).
   */
  11 : { message: "TooManyCreators" },
  12 : { message: "TokenNotAllowed" },
  13 : { message: "FeeTooHigh" },
  14 : { message: "Unauthorized" }
}

/**
 * Event: Settled
 */
export interface SettledEvent {
  name: "Settled";
  data: {
    id: number;
    creator: string;
    views?: bigint;
    /**
     * Paid to the creator.
     */
    amount?: bigint;
    /**
     * Paid to the platform treasury.
     */
    fee?: bigint;
  };
}

/**
 * Struct: Campaign
 */
export interface Campaign {
  brand: string;
  /**
   * Link to the creative brief (Notion page, Google Doc, IPFS…).
   */
  brief_url: string;
  /**
   * Total amount ever deposited.
   */
  budget: bigint;
  /**
   * Maximum a single creator's post can cost the brand (payout + fee).
   */
  cap_per_creator: bigint;
  /**
   * Number of submissions.
   */
  creators: number;
  /**
   * Unix timestamp after which no new submissions are accepted.
   */
  deadline: bigint;
  /**
   * The token's decimals, read when the campaign was created.
   */
  decimals: number;
  /**
   * Platform fee in basis points, fixed when the campaign was created.
   */
  fee_bps: number;
  /**
   * Total platform fees taken from this campaign.
   */
  fees: bigint;
  id: number;
  /**
   * Token units paid per 1,000 verified views, before the platform fee.
   */
  rate_per_1k: bigint;
  refunded: boolean;
  /**
   * Amount still held by the contract for this campaign.
   */
  remaining: bigint;
  title: string;
  token: string;
}

/**
 * Event: Refunded
 */
export interface RefundedEvent {
  name: "Refunded";
  data: {
    id: number;
    amount?: bigint;
  };
}

/**
 * Event: ToppedUp
 */
export interface ToppedUpEvent {
  name: "ToppedUp";
  data: {
    id: number;
    from?: string;
    amount?: bigint;
  };
}

/**
 * Event: Submitted
 */
export interface SubmittedEvent {
  name: "Submitted";
  data: {
    id: number;
    creator: string;
    url?: string;
  };
}

/**
 * How long state is kept alive. Rent is paid by whoever's transaction
 * extends an entry: the brand when creating, the creator (or the fee
 * sponsor) when submitting, the verifier when settling.
 */
export interface RentPolicy {
  /**
   * Ledgers the contract instance (and its code) is extended to; renewed
   * whenever it falls below half.
   */
  instance_ttl: number;
  /**
   * Ledgers campaign entries outlive the end of settlement, so the brand
   * has time to refund.
   */
  margin: number;
}

/**
 * Struct: Submission
 */
export interface Submission {
  creator: string;
  /**
   * Platform fees taken from this creator's earnings so far.
   */
  fee: bigint;
  /**
   * Total paid out to this creator so far (after fees).
   */
  paid: bigint;
  submitted_at: bigint;
  url: string;
  /**
   * Highest view count the verifier has reported.
   */
  views: bigint;
}

/**
 * Event: TokenAllowed
 */
export interface TokenAllowedEvent {
  name: "TokenAllowed";
  data: {
    token: string;
    allowed?: boolean;
  };
}

/**
 * Event: ConfigChanged
 */
export interface ConfigChangedEvent {
  name: "ConfigChanged";
  data: {
    verifier?: string;
    treasury?: string;
    fee_bps?: number;
  };
}

/**
 * Event: CampaignCreated
 */
export interface CampaignCreatedEvent {
  name: "CampaignCreated";
  data: {
    id: number;
    brand: string;
    budget?: bigint;
    rate_per_1k?: bigint;
  };
}

/**
 * Error Enum: RoleTransferError
 */
export const RoleTransferError = {
  2200 : { message: "NoPendingTransfer" },
  2201 : { message: "InvalidLiveUntilLedger" },
  2202 : { message: "InvalidPendingAccount" },
  2203 : { message: "TransferExpired" }
}

/**
 * Error Enum: OwnableError
 */
export const OwnableError = {
  2100 : { message: "OwnerNotSet" },
  2101 : { message: "TransferInProgress" },
  2102 : { message: "OwnerAlreadySet" }
}

/**
 * Event emitted when an ownership transfer is initiated.
 */
export interface OwnershipTransferEvent {
  name: "OwnershipTransfer";
  data: {
    old_owner?: string;
    new_owner?: string;
    live_until_ledger?: number;
  };
}

/**
 * Event emitted when ownership is renounced.
 */
export interface OwnershipRenouncedEvent {
  name: "OwnershipRenounced";
  data: {
    old_owner?: string;
  };
}

/**
 * Event emitted when an ownership transfer is completed.
 */
export interface OwnershipTransferCompletedEvent {
  name: "OwnershipTransferCompleted";
  data: {
    new_owner?: string;
  };
}

/**
 * Event emitted when the contract is paused.
 */
export interface PausedEvent {
  name: "Paused";
  data: {

  };
}

/**
 * Event emitted when the contract is unpaused.
 */
export interface UnpausedEvent {
  name: "Unpaused";
  data: {

  };
}

/**
 * Error Enum: PausableError
 */
export const PausableError = {
  /**
   * The operation failed because the contract is paused.
   */
  1000 : { message: "EnforcedPause" },
  /**
   * The operation failed because the contract is not paused.
   */
  1001 : { message: "ExpectedPause" }
}
    export type ContractEvent = SettledEvent | RefundedEvent | ToppedUpEvent | SubmittedEvent | TokenAllowedEvent | ConfigChangedEvent | CampaignCreatedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent | PausedEvent | UnpausedEvent;
    