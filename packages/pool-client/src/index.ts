// CampaignPool client shared by the verifier and the web app. The contract
// interface itself comes from @clippay/campaign-pool-bindings, generated from
// the contract's Wasm by scripts/bindings.sh; this file adds business helpers:
// amounts, fees, error messages and paging.
import { contract } from "@stellar/stellar-sdk";
import {
  Client,
  Error as ContractErrors,
  OwnableError,
  PausableError,
  type Campaign,
  type Submission,
} from "@clippay/campaign-pool-bindings";

export type { Campaign, Submission };
export type PoolClient = Client;

/** Methods that return `Result<T, Error>` on-chain come back wrapped. */
type R<T> = contract.Result<T>;

export interface PoolConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  /** Signer address. Omit for read-only use. */
  publicKey?: string;
  signTransaction?: contract.ClientOptions["signTransaction"];
}

export async function poolClient(cfg: PoolConfig): Promise<PoolClient> {
  return new Client(cfg);
}

/** Unwrap an `Ok`/`Err` contract result, throwing a readable error on `Err`. */
export function unwrap<T>(r: R<T>): T {
  if (r.isErr()) throw new Error(describeError(r.unwrapErr()));
  return r.unwrap();
}

/** Matches `get_submissions`' MAX_PAGE in contracts/campaign-pool/src/lib.rs. */
export const PAGE = 50;

/** Every submission of a campaign, fetched a page at a time. */
export async function allSubmissions(
  client: PoolClient,
  c: Pick<Campaign, "id" | "creators">,
): Promise<Submission[]> {
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(c.creators / PAGE) }, (_, i) =>
      client.get_submissions({ id: c.id, start: i * PAGE, limit: PAGE }),
    ),
  );
  return pages.flatMap((p) => unwrap(p.result));
}

// --- errors ---------------------------------------------------------------

/**
 * Human text for every `Error` variant in contracts/campaign-pool/src/lib.rs,
 * plus the OpenZeppelin errors the contract can raise. The pool-client test
 * fails if this drifts from the contract.
 */
export const POOL_ERRORS: Record<number, string> = {
  1: "Campaign not found",
  2: "Amounts must be greater than zero",
  3: "Deadline must be in the future",
  4: "This campaign has ended",
  5: "You already submitted to this campaign",
  6: "No submission from this creator",
  7: "View count can't go down",
  8: "Settlement for this campaign is closed",
  9: "Refund opens after the settlement window",
  10: "Already refunded",
  11: "This campaign is full",
  12: "That token isn't accepted for campaigns",
  13: "Platform fee is above the 20% limit",
  14: "Only the contract owner can do that",
  1000: "ClipPay is paused for maintenance — refunds still work",
  1001: "ClipPay isn't paused",
  2100: "Contract owner isn't set",
  2101: "An ownership transfer is already in progress",
  2102: "Contract owner is already set",
};

const byName: Record<string, number> = Object.fromEntries(
  Object.entries({ ...ContractErrors, ...PausableError, ...OwnableError }).map(([code, v]) => [
    v.message,
    Number(code),
  ]),
);

/** Wallet, network and RPC failures, matched on the raw message. */
const FRIENDLY: [RegExp, string][] = [
  [/NotAllowedError|operation either timed out or was not allowed|cancel/i,
    "Passkey prompt was cancelled — try again when you're ready"],
  [/user declined|rejected|denied/i, "You declined the request in your wallet"],
  [/network passphrase|wrong network|mismatch/i,
    "Your wallet is on a different network — switch it to Testnet"],
  [/trustline|op_no_trust/i,
    "This account has no trustline for the payout token yet"],
  [/insufficient|underfunded|balance is not sufficient|op_underfunded|resulting balance/i,
    "Not enough funds in this wallet"],
  [/txTooLate|timeout|timed out|TRY_AGAIN_LATER/i, "The network took too long — please try again"],
  [/Failed to fetch|NetworkError|ECONNREFUSED/i, "Can't reach the network — check your connection"],
];

export function describeError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  const m = raw.match(/Error\(Contract, #(\d+)\)/);
  if (m) return POOL_ERRORS[Number(m[1])] ?? `Contract error #${m[1]}`;
  if (raw in byName) return POOL_ERRORS[byName[raw]] ?? raw;
  for (const [re, text] of FRIENDLY) if (re.test(raw)) return text;
  return raw;
}

// --- amounts ------------------------------------------------------------

/** SAC tokens (XLM, USDC) use 7 decimals; campaigns record their token's. */
export const DECIMALS = 7;

export function toUnits(amount: string | number, decimals = DECIMALS): bigint {
  const [whole, frac = ""] = String(amount).trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export function fromUnits(units: bigint, maxFrac = 2, decimals = DECIMALS): string {
  const scale = 10n ** BigInt(decimals);
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / scale;
  let frac = (abs % scale).toString().padStart(decimals, "0").slice(0, maxFrac);
  frac = frac.replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? "." + frac : ""}`;
}

/** What a post has earned at `views` (creator payout + fee), before the budget cap. */
export function earnedAt(c: Campaign, views: bigint): bigint {
  const earned = (views * c.rate_per_1k) / 1000n;
  return earned < c.cap_per_creator ? earned : c.cap_per_creator;
}

/** The creator's share of a gross amount after the campaign's platform fee. */
export function afterFee(c: Pick<Campaign, "fee_bps">, gross: bigint): bigint {
  return gross - (gross * BigInt(c.fee_bps)) / 10_000n;
}

/** "5%" for 500 bps. */
export function feePercent(bps: number): string {
  return `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}
